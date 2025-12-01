const express=require('express');
const router=express.Router();

const {getOrganizations,getAlumni,searchAlumni}=require('../controllers/alumniControllers');

router.get('/getOrganizations',getOrganizations);
router.get('/getAlumni',getAlumni);
router.get('/searchAlumni',searchAlumni);

module.exports=router;