const axios = require("axios");

async function testSearchClubs() {
  try {
    const res = await axios.get("http://localhost/universe/api/v1/club/searchClubs", {
      params: { query: "tech", uid: "507f1f77bcf86cd799439011" },
    });
    console.log("Success! Status:", res.status);
    console.log("Returned clubs:", res.data.length);
  } catch (error) {
    console.error("Failed:", error.response ? error.response.status : error.message);
  }
}

testSearchClubs();
