
const checkAdmin = async (req, res, next) => {
  try{
    const role = req.user.role

    if(role === 'admin'){
      return next()
    }
    return res.status(StatusCodes.MISDIRECTED_REQUEST).send("You are not authorized to access this route.");
  }catch(err){
    console.log(err)
    return res.status(StatusCodes.MISDIRECTED_REQUEST).send("You are not authorized to access this route.");
  }
}

module.exports = checkAdmin