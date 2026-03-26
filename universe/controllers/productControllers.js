const Product = require("../models/product");
const { StatusCodes } = require("http-status-codes");

const createProduct = async (req, res) => {
    try {
        let {
            name,
            description,
            image,
            type,
            category,
            pointsRequired,
            stock,
            variants,
            voucherDetails,
            requiresShipping
        } = req.body;

        // Basic validation
        if (!name || !type || pointsRequired === undefined) {
            return res.status(StatusCodes.BAD_REQUEST).json({ 
                success : false,
                message: "Name, type, and pointsRequired are required." });
        }

        const allowedTypes = ["physical", "digital"];
        if (!allowedTypes.includes(type)) {
            return res.status(StatusCodes.BAD_REQUEST).json({ 
                success : false,
                message: "Invalid type. Must be 'physical' or 'digital'." });
        }

        const allowedCategory = [
            "clothing",
            "accessory",
            "stationery",
            "voucher",
            "other"
        ];
        if (!allowedCategory.includes(category)) {
            return res.status(StatusCodes.BAD_REQUEST).json({ 
                success : false,
                message: "Invalid category"});
        }

        const isAvailable = stock > 0;

        if(voucherDetails){
            if(type !== "digital" && category !== "voucher"){
                return res.status(StatusCodes.BAD_REQUEST).json({ 
                    success : false,
                    message: "Voucher must be digital and voucher category." });
            }

            if(!voucherDetails.value || !voucherDetails.type){
                return res.status(StatusCodes.BAD_REQUEST).json({ 
                    success : false,
                    message: "Voucher value and type are required." });
            }

            const allowedVoucherTypes = ["percentage", "flat"];

            if(!allowedVoucherTypes.includes(voucherDetails.type)){
                return res.status(StatusCodes.BAD_REQUEST).json({ 
                    success : false,
                    message: "Invalid voucher type. Must be 'percentage' or 'flat'." });
            }
        }

        if(type === "physical"){
            requiresShipping = true;
        }

        const product = await Product.create({
            name,
            description,
            image,
            type,
            category,
            pointsRequired,
            stock,
            isAvailable,
            variants,
            voucherDetails,
            requiresShipping
        });

        res.status(StatusCodes.CREATED).json({
            success : true,
            message: "Product created successfully.",
            product
        });
    } catch (error) {
        console.log(error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
            success : false,
            message: "Something went wrong"
         });
    }
}

const getAllProducts = async (req, res) => {
    try {
        const { type, category } = req.query;
        const query = {};
        if (type) query.type = type;
        if (category) query.category = category;
        const products = await Product.find(query);
        res.status(StatusCodes.OK).json({
            success : true,
            message: "Products fetched successfully.",
            products
        });
    } catch (error) {
        console.log(error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
            success : false,
            message: "Something went wrong"
         });
    }
}

const getSingleProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findById(id);

        if (!product) {
            return res.status(StatusCodes.NOT_FOUND).json({ 
                success : false,
                message: "Product not found." });
        }

        res.status(StatusCodes.OK).json({
            success : true,
            message: "Product fetched successfully.",
            product
        });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
            success : false,
            message: "Something went wrong"
         });
    }
}

const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const product = await Product.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!product) {
            return res.status(StatusCodes.NOT_FOUND).json({ 
                success : false,
                message: "Product not found." });
        }

        if(updateData.stock < 0){
            return res.status(StatusCodes.BAD_REQUEST).json({ 
                success : false,
                message: "Stock cannot be negative." });
        }

        if(updateData.stock === 0){
            product.isAvailable = false;
        }

        if(updateData.stock > 0){
            product.isAvailable = true;
        }

        if(updateData.pointsRequired < 0){
            return res.status(StatusCodes.BAD_REQUEST).json({ 
                success : false,
                message: "Points required cannot be negative." });
        }
        
        res.status(StatusCodes.OK).json({
            success : true,
            message: "Product updated successfully.",
            product
        });
    } catch (error) {
        console.log(error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
            success : false,
            message: "Something went wrong"
         });
    }
}

const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findByIdAndDelete(id);

        if (!product) {
            return res.status(StatusCodes.NOT_FOUND).json({ 
                success : false,
                message: "Product not found." });
        }

        res.status(StatusCodes.OK).json({
            success : true,
            message: "Product deleted successfully.",
            product
        });
    } catch (error) {
        console.log(error)
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
            success : false,
            message: "Something went wrong"
         });
    }
}

module.exports = { createProduct, getAllProducts, getSingleProduct, updateProduct, deleteProduct };