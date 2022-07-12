const deepai = require("deepai");
require("dotenv").config();
const fs = require("fs");



const deepai_key = process.env.DEEPAI_API_KEY;

console.log(deepai_key);

deepai.setApiKey(deepai_key);

(async function () {

	let content_file = "imgs/pauline.jpg";
	let style_file = "imgs/painting1.jpeg";

	
	var result = await deepai.callStandardApi("CNNMRF", {
	
		content: new Blob(fs.createReadStream(content_file)),
	
		style: new Blob(fs.createReadStream(style_file))
	
	});

	console.log(result);

})()
