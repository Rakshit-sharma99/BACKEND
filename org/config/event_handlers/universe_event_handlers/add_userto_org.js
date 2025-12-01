const Org = require("../../../models/org");

 const add_userto_org = async (messageValue) => {
   try {
     const data = JSON.parse(messageValue);
     const {orgId,userId} = {data};

     const org = await Org.findById(orgId,{working:1});
     org.working.push(userId);
     
     await org.save();
    
   } catch (error) {
     console.log(error);
     console.log("📩 Failed to process add user to org topic");
   }
 };
 
 module.exports = { add_userto_org };
 