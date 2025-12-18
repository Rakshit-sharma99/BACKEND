const jwt = require("jsonwebtoken");
const axios = require("axios");

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: "bags",
      role: "internal",
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" }
  );
  return {
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
};


const getUnsortedWords = async ()=>{
    try{
        const config = generateServiceToken();

        const response = await axios.get(
            "http://unsorted:6090/unsorted/api/v1/getUnsortedWords",
            config
        );
        const {unsortedWords} = response.data;

        return unsortedWords;
    }catch(error){
        console.log(error.message);
    }
}

module.exports = {
  getUnsortedWords,
};