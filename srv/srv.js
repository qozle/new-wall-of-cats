//  web page is served from normal web server

//  socket is opened

//  connect to twitter stream

//  when data comes in, put it in the database

//  process image (in the style of 1 of x famous painters)

//  only need the 9 most recent entries in the database because they're only being used for
//  new clients (new page loads)



"use strict";

//  used for making requests
const axios = require("axios").default;
//  Node WS lib
const WebSocketServer = require("ws");
//  get env vars from env file
require("dotenv").config();
//  tensorflow for node
const tf = require("@tensorflow/tfjs");
//  NSFWjs for image NSFW classification ^_-
const nsfw = require("nsfwjs");


//  secure env vars
const bearer_token = process.env.BEARER_TOKEN;
const stream_url = process.env.STREAM_URL;
const rules_url = process.env.RULES_URL;



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
function handle_axios_error(error) {
	//  request was made, response received, but out of 200 range
	if (error.respose) {
		console.log("Response received out of 200 range =(");
		console.log(error.status);
		console.log(error.data);
		
	} else if (error.request) {
		//  request was made but no response received
		console.log("Request made but no response received =(");
		console.log(error.request);

	} else {
		console.log("Bad Axios setup for request:");
		console.log(error.message);
	}
}


/////////////////
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
					handle_axios_error(error);
				});
			
			return get_rules_promise;

		})
		.catch(function (error) {
			handle_axios_error(error);
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

	return axios.get(streamURL, config)
		.catch(function (error) {
			handle_axios_error(error);
		});

}


////////////////
//  load NSFW model
async function load_nsfw() {
	console.log("pre-loading model...");
	const model = nsfw.load("graph_model/", {type: 'graph'});
	console.log("loaded nsfw model");
	return model;
}


///////////////
//  test image for NSFW content
async function is_img_safe(model, img) {

	//  get image
	const image_response = await axios.get(img, { responseType: "arraybuffer" });

	//  image must be in tf.tensor3d format
	const image_tf3d = await tf.node.decodeImage(image_response.data, 3);

	//  get predictions
	const predictions = await model.classify(image_tf3d);

	//  we have to clean this up manually
	image_tf3d.dispose();

	return predictions;

}



/////////////////////////////
//  M A I N  ////////////////
/////////////////////////////


//  enclosing everything so nothing is accessible just in case
(() => {
	
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
				.then((streamResponse) => {

					console.log("Successfully connected to Twitter API stream.");

					return streamResponse.data;
				})
				
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

			console.log("Successfully set rules and pre-loaded NSFW model.");

			//  unpack values from promise returns
			let stream = values[0].data;
			let model = values[1];

	

			//  Creating a new websocket server
			//  this is insecure- see above commented code for WSS (WS via HTTPS)
			console.log("Starting up WebSocketServer.");
			const wss = new WebSocketServer.Server({ port: 1337 });
			console.log("The WebSocket server is running on port 1337.");

		
			//  When a new client connects, set event listeners
			wss.on("connection", ws => {

				console.log("new client connected");
		
				//  assign stream event listeners
				stream.on("data", async (data) => {
				
					//  parse stream data
					try {
						var data_json = JSON.parse(data);
					} catch (thrown) {
						//  if we don't get parsable JSON back, it's prolly a heartbeat.
						var msg_string = data.toString();

						if (msg_string == "\r\n") {
							console.log("\n*heartbeat*\n");
						}

						return;
					}


					///////////////////
					//  PROCESS IMAGE / DATA

					//  1)  get the image

					//  2)  NSFW?
					//  3)  Are there cats?
					//  4)  style-transform



					//  send data to client
					ws.send(JSON.stringify({
						type: "twitter_data",
						data: data_json
					}));

				});
		

				//  when the client sends us data
				ws.on("message", data => {
					console.log(`Client has sent us: ${data}`)
				});
		

				//  client disconnect
				ws.on("close", () => {
					console.log("A client has disconnected");
					//  have to close the twitter stream here and cleanup
				});
		

				//  handling client connection error
				ws.on('error', function (err) {
					console.log("Some WS error occurred");
					console.log(err);
				});
		
			});

		})
		.catch(function (error) {
			console.log("there was an error");
			console.log(error);
		});
		

})();