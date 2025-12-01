const Universe = require("../models/universe");

let lastUpdated = new Date();;

const createUniverse = async (req, res) => {
  try {
    const { name, location, logo, rank, traffic, callSign } = req.body;

    if (!name || !location || !logo || !callSign) {
      return res.status(400).json({
        success: false,
        message: "Name, location, and logo are required.",
      });
    }

    const universe = await Universe.create({
      name,
      location,
      logo,
      rank,
      traffic,
      callSign,
    });

    lastUpdated = new Date();
    return res.status(201).json({
      success: true,
      message: "Universe created successfully.",
      data: universe,
    });
  } catch (error) {
    console.error("Error creating universe:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

const getAllUniverse = async(req,res) => {
  try{

    const universes = await Universe.find({},{
      _id:1,
      name:1,
      logo:1,
      location:1,
      callSign:1
    });

    if(!universes){
      return res.status(200).json({
        success:true,
        message:"No universe found.",
        universes:[]
      })
    };

    return res.status(200).json({
      success:true,
      message:"universe fetched successfully.",
      universes,
      lastUpdated
    })

  }catch(err) {
    console.log("Error fetching universe :",err);
    return res.status(500).json({
      success:false,
      message:"Internal server error.",
      error:err.message
    })
  }
}

const getLastUpdated = (req,res) => {
  return res.status(200).json({lastUpdated})
}

module.exports = { createUniverse,getAllUniverse,getLastUpdated };
