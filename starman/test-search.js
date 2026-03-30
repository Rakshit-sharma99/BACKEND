const axios = require('axios');
const jwt = require('jsonwebtoken');

const token = jwt.sign({ role: "internal", service: "starman" }, process.env.ACCESS_TOKEN_SECRET || "61c9e741011410b4b54f8628adc6706d1468be91a2ad8de7f8404d44be5234a144590bacfb58cb6fbb182cb3d40d2d356a9c4beb7ff3a95877f9d483624672b4", { expiresIn: "5m" });

axios.get('http://localhost:7050/map/api/v1/territory/searchTerritories', {
  params: { q: 'startup' },
  headers: { Authorization: `Bearer ${token}` }
})
.then(res => console.log(JSON.stringify(res.data, null, 2)))
.catch(err => console.error(err.message));
