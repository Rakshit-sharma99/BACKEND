const jwt = require("jsonwebtoken");
const axios = require("axios");
const Mailgen = require("mailgen");
const AWS = require("aws-sdk");

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: "badge",
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
}

const getBody = (n, organisationId, organisationType, organisationInfo,uid,universeMetaData) =>{
  let arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      title: 'Stellar Performer',
      url: 'public/Macbease/SunApr07202410:14:32GMT+0530+0}',
      organisationId,
      organisationType,
      organisationInfo,
      uid,
      universeMetaData
    });
  }
  return arr;
}

const checkAuthorization = async (organisationId,organisationType,concernedId) =>{
  try {
    if (organisationType === 'Club') {
      const club = await getClubFieldsById(organisationId, ['mainAdmin']);
      if (club.mainAdmin === concernedId) {
        return true;
      }
    } else if (organisationType === 'Community') {
      const community = await getCommunityFieldsById(organisationId, ['creatorId']);
      if (community.creatorId === concernedId) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.log(error.message);
    return false;
  }
}

const getClubFieldsById = async(organisationId,fields) => {
  try{
      const config = generateServiceToken();
      const body = {
        id: organisationId,
        fields: fields
      }
      const response = await axios.post(
          `http://universe-srv:5050/universe/api/v1/club/getClubFieldsById`,
          body,
          config
      );
      const {data} = response.data;
      return data;
  }catch(error){
    console.log(error.message);
  }
}

const getCommunityFieldsById = async(organisationId,fields) => {
  try{ 
      const config = generateServiceToken();
      const body = {
        id: organisationId,
        fields: fields
      }
      const response = await axios.post(
          `http://universe-srv:5050/universe/api/v1/community/getCommunityFieldsById`,
          body,
          config
      );
      const {data} = response.data;
      return data;
  }catch(error){
    console.log(error.message);
  }
}

const sendMail = async (name,intro,outro,subject,destination,action,emailHTML) => {
  const mailGenerator = new Mailgen({
    theme: "cerberus",
    product: {
      name: "Macbease Team",
      link: "https://macbease.com/",
      logo: "https://mailgen.js/img/logo.png",
    },
  });

  const email = {
    body: {
      name: name,
      intro: intro,
      action: action
        ? {
            instructions:
              action.instructions || "Click the button below to proceed:",
            button: {
              color: action.color || "#1ea1ed",
              text: action.text || "View Details",
              link: action.url,
            },
          }
        : undefined,
      outro: outro,
    },
  };

  if (!Array.isArray(destination)) {
    destination = [destination];
  }

  const emailBody = emailHTML ? emailHTML : mailGenerator.generate(email);

  const params = {
    Source: '"Macbease" <support@macbease.com>',
    Destination: {
      ToAddresses: ["support@macbease.com"],
      BccAddresses: destination,
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Html: {
          Data: emailBody,
        },
      },
    },
  };

  AWS.config.update({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  const ses = new AWS.SES();
  return { ses, params };
};

const getUserById = async (id, fields) => {
  try {
    const config = generateServiceToken();
    const body = {
      id: id,
      fields: fields
    }
    const response = await axios.post(
      `http://universe-srv:5050/universe/api/v1/user/getUserFieldsById`, 
      body,
      config);
    const user = response.data;
    if (!user) {
      throw new Error("User not found.");
    }
    return user;
  } catch (error) {
    console.error("Error fetching user by ID:", error.message);
    throw error;
  }
}

module.exports = {
  getBody,
  checkAuthorization,
  getClubFieldsById,
  getCommunityFieldsById,
  sendMail,
  getUserById
}