const user = require('../../../models/user');

const update_user = async(messageValue)=>{
    try{
        const { ids } = JSON.parse(messageValue);
        const result = await User.updateMany(
            { _id: { $in: ids } }, 
            { $set: { image: 'public/users/Preview-1re.png' } } 
        )

        if (result){
            console.log(`✅ Updated ${result.modifiedCount} users with new image.`);
        }
        else {
            console.warn("No users were updated.");
        }
    }catch(error){
        console.error("❌ Failed to process update user topic:", error);
    }
}

module.exports = {
    update_user,
}