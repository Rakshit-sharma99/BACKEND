const PDFDocument = require("pdfkit");
const fs = require('fs');

async function test() {
  console.log("Starting PDF test");
  try {
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream('out.pdf'));
    
    // Create a large random buffer (not an image)
    const badBuffer = Buffer.alloc(100000, 'a');
    
    console.log("Drawing image");
    doc.image(badBuffer, 0, 0);
    console.log("Image drawn");
    doc.end();
  } catch(e) {
    console.error("PDF Error:", e);
  }
}
test();
