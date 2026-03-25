const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    res.send("Products are running!!");
});

router.post('/createProduct',createProduct)
router.get('/getAllProducts',getAllProducts)
router.get('/getSingleProduct/:id',getSingleProduct)
router.put('/updateProduct/:id',updateProduct)
router.delete('/deleteProduct/:id',deleteProduct)

module.exports = router;
