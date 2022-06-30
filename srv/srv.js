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


	let test = await axios.post(rulesURL, data, config)
		.then(async function (response) {			
			
			console.log("Rules set");

			//  Get current rules, to confirm that they're set correctly
			console.log("Getting current Twitter API Stream rules...");

			let config = {
				headers: {
					authorization: `Bearer ${token}`
				}
			}

			let test2 = await axios.get(rulesURL, config)
				.then(function (response) {					
				
					console.log("Rules set successfully.");
					return response.data.data
				
				}).catch(function (error) {

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

				});
			
			return test2;

		})
		.catch(function (error) {
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
		});
	
	
	return test;
};


setRules(rules, rules_url, bearer_token)
	.then(function (response) {
		console.log("Everything finished OK");
		console.log(response);
	})
	.catch(function (error) {
		console.log("There was an error...");
		console.log(error);
	});



//  Open twitter stream
async function get_twitter_stream(streamURL, token) {
	
	let config = {
		headers: {
			authorization: `Bearer ${token}`,
			compressed: true
		}
	}

	return axios.get(streamURL, config)
		.catch(function (error) {
			if (error.respose) {
				console.log("Stream response received out of 200 range =(");
				console.log(error.status);
				console.log(error.data);
				
			} else if (error.request) {
				//  request was made but no response received
				console.log("Stream request made but no response received =(");
				console.log(error.request);

			} else {
				console.log("Bad Axios setup for stream request:");
				console.log(error.message);
			}
		});

}

get_twitter_stream(stream_url, bearer_token)
	.then(function (stream) {

		stream.on("data", async (data) => {
			
			console.log(data);
		})
	}).catch(function (error) {
		console.log("there was an error")
		console.log(error);
	});




 
// //   Creating a new websocket server
// //  this is insecure- see above commented code for WSS (WS via HTTPS)
// const wss = new WebSocketServer.Server({ port: 1337 })
 
// // Creating connection using websocket
// wss.on("connection", ws => {
// 	console.log("new client connected");
	
//     // sending message
//     ws.on("message", data => {
//         console.log(`Client has sent us: ${data}`)
// 	});
	
//     // handling what to do when clients disconnects from server
//     ws.on("close", () => {
//         console.log("the client has disconnected");
// 	});
	
//     // handling client connection error
//     ws.onerror = function () {
//         console.log("Some Error occurred")
// 	}
	
// });

// console.log("The WebSocket server is running on port 1337");