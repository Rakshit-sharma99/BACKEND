const axios = require('axios');
const url = 'https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/' + encodeURIComponent('public/club/SatMar07202615:30:33GMT+0530').replace(/%2F/g, '/');

console.log("Fetching:", url);
axios.get(url, { responseType: 'arraybuffer' })
  .then(res => console.log("Success:", res.data.length))
  .catch(err => console.error("Error:", err.response ? err.response.status : err.message));
