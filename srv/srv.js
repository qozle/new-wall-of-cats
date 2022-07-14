"use strict";



/////////////////////////////
//  M A I N  ////////////////
/////////////////////////////



const axios = require("axios").default;
const WebSocketServer = require("ws");
require("dotenv").config();
// const spawn = require("child_process").spawn;
const tf = require("@tensorflow/tfjs-node");
const nsfw = require("nsfwjs");
const cocoSsd = require("@tensorflow-models/coco-ssd");
const deepai = require("deepai");
const fs = require("fs");
const https = require("https");



//  secure env vars
const bearer_token = process.env.BEARER_TOKEN;
const stream_url = process.env.STREAM_URL;
const rules_url = process.env.RULES_URL;
const deepai_key = process.env.DEEPAI_API_KEY;


//  global scope vars
var ws_clients = [];
var idle_checkup_interval;
var is_idle = false;
var nsfwModel;
var cocoSsdModel;


//  rules that we're using for our twitter stream
const rules = [
	{
	value:
		"(cat OR cats OR kitty OR kitten) has:images -is:quote -is:retweet -has:mentions",
	tag: "catRules",
	},
];

//  set API key for deepai client
deepai.setApiKey(deepai_key);



////////////////////////////////
//  F U N C T I O N S  L I B  //
////////////////////////////////

////////////////////
//  utility to handle async errors from axios
function handle_request_error(error) {
	//  request was made, response received, but out of 200 range
	if (error.response) {

		let resp = error.response;

		
		if (resp.status == 429) {
			console.log("Too many requests");
			
			console.log(resp.headers["x-rate-limit-remaining"]);
			console.log(resp.headers["x-rate-limit-limit"]);

			let x_rate_reset = resp.headers["x-rate-limit-reset"];

			let reset = new Date(x_rate_reset * 1000);

			console.log(`Reset at ${reset}`);
			console.log(reset);
		}

		console.log("\nGot a non 200 response from a request:")
		console.log("\n");
		console.log(resp.status);
		console.log(resp.data);
		console.log(error.request.headers);
		console.log("\n");

		
	} else if (error.request) {
		//  request was made but no response received
		console.log("Request made but no response received =(");
		console.log(error.request);

	} else {
		//  bad axios config
		console.log("Bad Axios setup for request:");
		console.log(error.message);
	}

}


//////////////
// Function to set rules for Twitter API Stream
async function setRules(rules, rulesURL, token) {

	console.log("Setting rules for Twitter API Stream...");

	let data = { add: rules };

	let config = {
		headers: {
			"Content-Type": "application/json",
			authorization: `Bearer ${token}`
		}
	}


	let set_rules_promise = await axios.post(rulesURL, data, config)
		.then(async function (response) {			
			
			console.log("Rules set");

			//  Get current rules, to confirm that they're set correctly
			console.log("Getting current Twitter API Stream rules...");

			let config = {
				headers: {
					authorization: `Bearer ${token}`
				}
			}

			let get_rules_promise = axios.get(rulesURL, config)
				.then(function (response) {					
				
					console.log("Rules set successfully (rules check out).");
					return response.data.data
				
				}).catch(function (error) {
					handle_request_error(error);
				});
			
			return get_rules_promise;

		})
		.catch(function (error) {
			handle_request_error(error);
		});	
	
	return set_rules_promise;
};


///////////////
//  Open twitter stream
async function get_twitter_stream(streamURL, token) {
	
	let config = {
		headers: {
			authorization: `Bearer ${token}`,
		},
		responseType: 'stream'
	}

	let stream = await axios.get(streamURL, config)
		.catch(function (error) {
			handle_request_error(error);
		});
	
	return stream;

}


////////////////
//  load NSFW model
async function load_nsfw() {
	console.log("pre-loading model...");
	const model = await nsfw.load("file://graph_model/", {type: 'graph'});
	console.log("loaded nsfw model.");
	return model;
}


////////////////////
//  load cocoSsd model
async function load_cocoSsd() {
	console.log("pre-loading COCO-SSD model...");
	const model = await cocoSsd.load();
	console.log("loaded COCO-SSD model.");
	return model;
}


async function decode_image(img) {
	//  get image
	// console.log("GETting tweet media...");
	console.log("decoding image...");
	const image_response = await axios.get(img, { responseType: "arraybuffer" });

	//  image must be in tf.tensor3d format
	// console.log("decoding image to tf.tensor3d...");
	const image_tf3d = await tf.node.decodeImage(image_response.data, 3);

	return { image_tf3d, img };
}




///////////////
//  test image for NSFW content
async function is_img_safe(img_obj) {
	
	let img = img_obj.img
	let image_tf3d = img_obj.image_tf3d;

	//  get predictions
	// console.log("calculating model predictions...");
	const predictions = await nsfwModel.classify(image_tf3d);

	//  we have to clean this up manually
	// console.log("disposing of image");
	
	let highest = 0;
	let className;
	
	predictions.forEach((prediction) => {
		if (prediction.probability > highest) {
			highest = prediction.probability;
			className = prediction.className;
		}
	});
	
	if (['Porn', 'Sexy', 'Hentai'].includes(className)) {
		console.log("XXxx It's mainly porn, sexy, or hentai, see yuhhh xxXXX");
		image_tf3d.dispose();
		return false;
		
	} else {
		console.log("image passed trials, good to go.");
		return { image_tf3d, img };
	}

}


//////////////////////
//  determine if image actually has cats in it
async function are_there_cats(img) {

	console.log("detecting objects...");
	const detected_objects = await cocoSsdModel.detect(img.image_tf3d);

	let cat_presence = false;

	detected_objects.some((obj) => {
		if (obj.class == 'cat') {
			cat_presence = true;
			return cat_presence;
			//  return cat_presence = true;
		}
	});

	if (cat_presence) {
		console.log("we found some cats");
		return img;
	} else {
		console.log("no cats found in image =/");
		img.image_tf3d.dispose();
		return false;
	}

}


async function transfer_style(content, style_opt = false) {
	
	//////////////
	//  unless we pass a specific style image, we'll just pick from this bank
	const styles = [
		"imgs/painting1.jpeg",
		"imgs/painting2.jpg",
		"imgs/painting3.jpeg",
		"imgs/painting4.jpg"
	]

	const random_ind = Math.floor(Math.random() * 4);

	if (style_opt == false) {
		var style_file = styles[random_ind];
	}

	var content_file = "imgs/pauline.jpg";


	// console.log("content");
	// console.log(content_file);
	// console.log("style");
	// console.log(style_file);

	///////////////
	//  stylize
	console.log("calling style-transfer deepai API...");

	let data = {
		'content': fs.createReadStream("imgs/pauline.jpg"),
		'style': fs.createReadStream("imgs/painting1.jpeg")
  	};

	let config = {
		headers: {
			'Api-Key': deepai_key,
			// 'Content-Type': 'application/json'
		}
	};


	var result = await axios.post("https://api.deepai.org/api/neural-style", data, config)
		.catch(function (error) {
			handle_request_error(error);
		});


	// var result = await deepai.callStandardApi("CNNMRF", {
		// content: fs.createReadStream(content_file),
		// style: fs.createReadStream(style_file)
	// });


	return result;

}


/////////////////
//  handle Twitter API stream data
function handle_twitter_data(data) {

	/////////////////
	//  parse stream data
	try {
		var data_json = JSON.parse(data);
	} catch (thrown) {
		//  if we don't get parsable JSON back, it's prolly a heartbeat.
		var msg_string = data.toString();

		if (msg_string == "\r\n") console.log("\n*heartbeat*\n");

		return;
	}


	///////////////////
	//  PROCESS IMAGE / DATA

	let decode_images_promises = [];
	
	data_json.includes.media.forEach((img) => {
		decode_images_promises.push(decode_image(img.url));		
		
	});

	console.log(`${decode_images_promises.length} media URLs`);

	//  get all decoded images
	Promise.all(decode_images_promises)
		.then((decoded_values) => {
			
			let nsfw_promises = [];

			decoded_values.forEach((decoded_img) => {
				nsfw_promises.push(is_img_safe(decoded_img));
			});
			//  get whether each image is SFW
			Promise.all(nsfw_promises)
				.then((nsfw_values) => {
					
					//  filter results, because async doesn't work with Array.prototype.filter
					let sfw_images = nsfw_values.filter((img) => img);
					
					let cocoSsd_promises = [];
					
					sfw_images.forEach((img) => {
						cocoSsd_promises.push(are_there_cats(img))
					});


					Promise.all(cocoSsd_promises)
						.then((cocoSsd_values) => {
						
							let cat_images = cocoSsd_values.filter((img) => img);
							
							if (!cat_images.length) {
								console.log("no useable images =/\n");
								return;
							}

							console.log(`${cat_images.length} useable URLs\n`);

							//  dispose of tf3d objects and create array of urls
							let cat_urls = cat_images.map((img) => {
								img.image_tf3d.dispose();
								return img.img;
							});
							
							
							//  send data to client(s)
							ws_clients.forEach((client) => {
								
								client.send(JSON.stringify({
									type: "twitter_data",
									data: cat_urls
								}));
				
							});
							
							// //////////  S T Y L I Z E  //////////
							// let styled_image_promises = [];

							// cat_urls.forEach((img) => {
							// 	styled_image_promises.push(transfer_style(img));
							// });

							// Promise.all(styled_image_promises)
							// 	.then((style_values) => {

							// 		console.log("finished getting styled images");
							// 		console.log(style_values);
									
									

							// 	}).catch((error)=>{
							// 		console.log("There was an error with the deepAI promises.");
							// 		console.log(error);
							// 	});

								

						}).catch((error)=>{
							console.log("There was an error with the cocoSsd promises.");
							console.log(error);
						});

				}).catch((error)=>{
					console.log("There was an error with the NSFW promises.");
					console.log(error);
				});

		}).catch((error)=>{
			console.log("There was an error with the decoding images promises.");
			console.log(error);
		});

	
}


////////////
//  start idle checkup interval
function start_idle_checkup(stream) {

	idle_checkup_interval = setInterval(function (source) {

		if (is_idle) {

			//  we're idle, close the stream connection
			console.log("We're idle, closing the Twitter API stream...");
			stream.request.abort();
			console.log("Stream closed.");

			console.log("Stopping idle checker.");
			clearInterval(idle_checkup_interval);

		} else {

			if (!ws_clients.length) {
				console.log("hmm, no one's around...setting is_idle to true...");
				//  if we have no clients, then the next pass (3m), we'll catch that we're idle and close the stream.
				is_idle = true;
			}

		}

	}, 180000, stream);
}




//////////////////////////////////
//  create server startup promises
///////////////////////////////////


//  set and double-check rules for Twitter API stream filter
let setRulesPromise = setRules(rules, rules_url, bearer_token)
	.then(function (response) {

		console.log("Twitter API stream filter rules:");
		console.log(response);
		console.log("");
	
		//  connect to Twitter API stream
		return get_twitter_stream(stream_url, bearer_token)
			.catch(error => handle_request_error(error));
			
	})
	.catch(function (error) {
		console.log("There was an error...");
		console.log(error);
	});


//  preload model for NSFW
let preloadNsfwModelPromise = load_nsfw();

let multiObjectModelPromise = load_cocoSsd();





//  make sure setup steps are completed, then add event listeners
Promise.all([setRulesPromise, preloadNsfwModelPromise, multiObjectModelPromise])
	.then(function (values) {
		console.log(
			"Successfully set rules, pre-loaded NSFW model, and connected to Twitter API filtered stream."
		);

		//  unpack values from promise returns
		var stream = values[0];
		nsfwModel = values[1];
		cocoSsdModel = values[2];

		console.log(stream.status);

		let connections_remaining = stream.headers["x-rate-limit-remaining"];
		let connections_limit = stream.headers["x-rate-limit-limit"];
		let connections_reset = new Date(
			stream.headers["x-rate-limit-reset"] * 1000
		);

		console.log(
			`We have ${connections_remaining} connect attempts left of ${connections_limit} before we hit our rate limit.`
		);
		console.log(`Reset is at ${connections_reset}`);

		///////////////
		//  Creating a new websocket server
		//  this is insecure- see above commented code for WSS (WS via HTTPS)

		//  FOR HTTPS SECURE WSS CONNECTION
		console.log("Starting up secure server and WebSocketServer.");



		const server = https.createServer({
		  cert: fs.readFileSync("/etc/letsencrypt/live/01014.org/fullchain.pem"),
		  key: fs.readFileSync("/etc/letsencrypt/live/01014.org/privkey.pem"),
		  port: 1337
		});

		console.log(server);

		const wss = new WebSocketServer.Server({
			server: server
			// port: 1337
		});
		




		// const wss = new WebSocketServer.Server({ port: 1337 });
		console.log("The WebSocket server is running on port 1337.");

		console.log("Starting idle checker...");
		start_idle_checkup(stream);

		//////////////////
		//  assign stream event listeners
		stream.data.on("data", (data) => {
			handle_twitter_data(data);
		});

		///////////////////
		//  When a new client connects, set event listeners
		wss.on("connection", (ws) => {
			console.log("new client connected");

			let index = ws_clients.push(ws) - 1;

			//  if they're the first person to join and the server's idle...
			if (!index && is_idle) {
				is_idle = false;

				get_twitter_stream(stream_url, bearer_token)
					.then((response) => {
						var stream = response;

						start_idle_checkup(stream);

						stream.data.on("data", (data) => {
							handle_twitter_data(data);
						});
					})
					.catch((error) => {
						handle_request_error(error);
					});
			}

			//  when the client sends us data
			ws.on("message", (data) => {
				console.log(`Client has sent us: ${data}`);
			});

			//  client disconnect
			ws.on("close", () => {
				console.log("A client has disconnected");

				//  remove socket client from our list of clients
				ws_clients.splice(index, 1);
			});

			//  handling client connection error
			ws.on("error", function (err) {
				console.log("Some WS error occurred");

				//  remove socket client from our list of clients
				ws_clients.splice(index, 1);

				console.log(err);
			});
		});
	})
	.catch(function (error) {
		console.log("there was an error");
		console.log(error);
	});
		


