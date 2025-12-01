const mongoose=require("mongoose");
const unsortedSchema=new mongoose.Schema({
    word:{
        type:String
    }
});
module.exports=mongoose.model("Unsorted",unsortedSchema);