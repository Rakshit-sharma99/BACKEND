const express = require("express");
const router = express.Router();
const {
    createProduct,
    getAllProducts,
    getSingleProduct,
    updateProduct,
    deleteProduct
} = require("../controllers/productControllers");

router.post('/createProduct', createProduct);
router.get('/getAllProducts', getAllProducts);
router.get('/getSingleProduct/:id', getSingleProduct);
router.put('/updateProduct/:id', updateProduct);
router.delete('/deleteProduct/:id', deleteProduct);

module.exports = router;
