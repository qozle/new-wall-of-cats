//  web page is served from normal web server

//  socket is opened

//  connect to twitter stream

//  when data comes in, put it in the database

//  process image (in the style of 1 of x famous painters)

//  only need the 9 most recent entries in the database because they're only being used for
//  new clients (new page loads)



"use strict";



/////////////////////////////
//  M A I N  ////////////////
/////////////////////////////



//  used for making requests
const axios = require("axios").default;
//  Node WS lib
const WebSocketServer = require("ws");
//  get env vars from env file
require("dotenv").config();
//  used for spawning a child process
const spawn = require("child_process").spawn;

//  tensorflow for node
const tf = require("@tensorflow/tfjs-node");
//  NSFWjs for image NSFW classification ^_-
const nsfw = require("nsfwjs");


//  secure env vars
const bearer_token = process.env.BEARER_TOKEN;
const stream_url = process.env.STREAM_URL;
const rules_url = process.env.RULES_URL;


//  global scope vars
var ws_clients = [];
var idle_checkup_interval;
var is_idle = false;
var model;


//  rules that we're using for our twitter stream
const rules = [
	{
	value:
		"(cat OR cats OR kitty OR kitten) has:images -is:quote -is:retweet -has:mentions",
	tag: "catRules",
	},
];


// //  FOR HTTPS SECURE WSS CONNECTION
// const fs = require('fs');
// const https = require('https');

// const server = https.createServer({
//   cert: fs.readFileSync("../test/fixtures/certificate.pem"),
//   key: fs.readFileSync("../test/fixtures/key.pem"),
// }, app);

// const wss = new WebSocketServer({ server });




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
		console.log("\\n");
		console.log("\ndata\n");

		
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
	console.log("loaded nsfw model");
	return model;
}


///////////////
//  test image for NSFW content
async function is_img_safe(img) {

	//  get image
	const image_response = await axios.get(img, { responseType: "arraybuffer" });

	//  image must be in tf.tensor3d format
	const image_tf3d = await tf.node.decodeImage(image_response.data, 3);

	//  get predictions
	const predictions = await model.classify(image_tf3d);

	//  we have to clean this up manually
	image_tf3d.dispose();

	let highest = 0;
	let className;

	predictions.forEach((prediction) => {
		if (prediction.probability > highest) {
			highest = prediction.probability;
			className = prediction.className;
		}
	});

	if (['Porn', 'Sexy', 'Hentai'].includes(className)) return false;
	else return true;

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

	//  1)  get the image(s)
	// let imgs = [];

	// data_json.includes.media.forEach((img) => {
	// 	imgs.push(img.url);
	// });


	// //  2)  NSFW?
	// Promise.all(imgs.map(async (img) => {
	// 	console.log(`NSFW checking index ${ind} of imgs`);
		
	// 	let nsfwPromise = await is_img_safe(img);
				


	// 	if (!img_is_safe) {
	// 		imgs.splice(ind, 1);
	// 	}

	// }));


	//  3)  Are there cats?
	//  4)  style-transform





	




	//  send data to client(s)
	ws_clients.forEach((client) => {
		
		client.send(JSON.stringify({
			type: "twitter_data",
			data: data_json
		}));

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




///////////////
//  create server startup promises

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
let preloadModelPromise = load_nsfw();





//  make sure setup steps are completed, then add event listeners
Promise.all([setRulesPromise, preloadModelPromise])
	.then(function (values) {

		console.log("Successfully set rules, pre-loaded NSFW model, and connected to Twitter API filtered stream.");


		//  unpack values from promise returns
		var stream = values[0];
		model = values[1];

		console.log(stream.status);

		let connections_remaining = stream.headers["x-rate-limit-remaining"];
		let connections_limit = stream.headers["x-rate-limit-limit"];
		let connections_reset = new Date(stream.headers["x-rate-limit-reset"] * 1000);

		console.log(`We have ${connections_remaining} connect attempts left of ${connections_limit} before we hit our rate limit.`);
		console.log(`Reset is at ${connections_reset}`);
		
		
		///////////////
		//  Creating a new websocket server
		//  this is insecure- see above commented code for WSS (WS via HTTPS)
		console.log("Starting up WebSocketServer.");
		const wss = new WebSocketServer.Server({ port: 1337 });
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
		wss.on("connection", ws => {

			console.log("new client connected");
			
			let index = ws_clients.push(ws) - 1;

			//  if they're the first person to join and the server's idle...
			if (!index && is_idle) {

				is_idle = false;

				get_twitter_stream(stream_url, bearer_token)
					.then((response) => {

						var stream = response.stream;
						var source = response.source;

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
			ws.on("message", data => {
				console.log(`Client has sent us: ${data}`)
			});
	

			//  client disconnect
			ws.on("close", () => {

				console.log("A client has disconnected");

				//  remove socket client from our list of clients
				ws_clients.splice(index, 1);
			});
	

			//  handling client connection error
			ws.on('error', function (err) {
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
		


