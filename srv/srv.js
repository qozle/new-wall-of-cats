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
//  used for spawning a child process
const spawn = require("child_process").spawn;



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


//  function for handling axios errors
const handle_axios_error = function (error) {

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
		//  bad axios config
		console.log("Bad Axios setup for request:");
		console.log(error.message);
	}

}



// Function to set rules for Twitter API Stream
async function setRules(rules, rulesURL, token) {

	console.log("Setting rules for Twitter API Stream...");

	let data = {
		add: rules
	};

	let config = {
		headers: {
			"Content-Type": "application/json",
			authorization: `Bearer ${token}`
		}
	}


	let promise_1 = await axios.post(rulesURL, data, config)
		.then(async function (response) {			
			
			console.log("Rules set");

			//  Get current rules, to confirm that they're set correctly
			console.log("Getting current Twitter API Stream rules...");

			let config = {
				headers: {
					authorization: `Bearer ${token}`
				}
			}

			let promise_2 = await axios.get(rulesURL, config)
				.then(function (response) {					
				
					console.log("Rules set successfully.");
					return response.data.data
				
				}).catch((error) => {
					handle_axios_error(error);
				});
			
			return promise_2;

		})
		.catch((error) => {
			handle_axios_error(error)
		});
	
	
	return promise_1;
};




function get_twitter_stream(streamURL, token, wss) {

	const controller = new AbortController();

	let config = {
		headers: {
			authorization: `Bearer ${token}`
		},
		responseType: "stream",
		signal: controller.signal
	}


	axios.get(streamURL, config)
		.then(function (response) {

			console.log("Connected to Twitter API stream.");

			let stream = response.data

			//////////////////////////////////////////////////////////////
			//  On receiving data from twitter (when there is a new post)
			stream.on('data', async (data) => {

				console.log('gotcha some data');

				
				try {
					var msg_json = JSON.parse(data);

					// console.log(msg_json.includes.media);
					
				} catch (thrown) {
					
					//  if we don't get parsable JSON back, it's prolly a heartbeat.
					var msg_string = data.toString();

					if (msg_string == "\r\n") {
						console.log("*heartbeat*\n");
					}

					return;
				}

				
				
				//  process image

				//  1)  check if NSFW
				//  2)  check if it actually has cats
				//  3)  run stylization script

				// https://stackoverflow.com/a/23452742

				//  child python process
				// const pythonProcess = spawn('python', ["path/to/script.py", arg1, arg2, arg3]);


				// pythonProcess.stdout.on('data', (data) => {
				// 	//  handle returned data
				// });


				//  3)  push to database, remove oldest entry in database
				//  4)  push to client



				//  send data to clients
				if (wss.clients.size) {

					console.log(wss.clients);

					wss.clients.forEach((client) => {

						client.send(JSON.stringify({
							type: "test",
							data: msg_json.includes.media[0]
						}));
						
					});
				}

				console.log(msg_json);
				console.log("\n")


			});
			
			
			///////////////
			//  On timout
			stream.on('timeout', async (err) => {
				console.log("The Twitter API stream connection timed out =(.");
				console.log(err.toString());
			});
			
			
			///////////////
			//  On abort
			stream.on('abort', async (data) => {
				console.log("Twitter API stream connection abort.");
				console.log(data.toString());
			});
			
			
			////////////////
			//  On aborted
			stream.on('aborted', async (data) => {
				console.log("Twitter API stream connection aborted.");
				console.log(data.toString());
			});
			
			
			//////////////////
			//  On prefinish
			stream.on('prefinish', async (data) => {
				console.log("Twitter API stream prefinish function.");
				console.log(data);
			});
			
			
			///////////////
			//  On error
			stream.on('error', async (error) => {
				console.log("There was an error in the Twitter API stream =(");
				console.log(error);
			});
		}).catch((error) => {
			handle_axios_error(error);
		});
		

	return controller;
	
}



//   Creating a new websocket server
//  this is insecure- see above commented code for WSS (WS via HTTPS)
const wss = new WebSocketServer.Server({ port: 1337 })
 
// Creating connection using websocket
wss.on("connection", ws => {
	console.log("new client connected");
	
    // sending message
    ws.on("message", data => {
        console.log(`Client has sent us: ${data}`)
	});
	
    // handling what to do when clients disconnects from server
    ws.on("close", () => {
        console.log("the client has disconnected");
	});
	
    // handling client connection error
    ws.onerror = function () {
        console.log("Some Error occurred")
	}
	
});

console.log("The WebSocket server is running on port 1337");





setRules(rules, rules_url, bearer_token)
	.then(function (response) {

		console.log("Succesfully set rules for Twitter API stream.");
		console.log(response);
		
		
		let controller = get_twitter_stream(stream_url, bearer_token, wss);
			
		
	})
	.catch(function (error) {
		console.log("There was an error...");
		console.log(error);
	});










 
