const AccessCode = require("../models/access");
const { StatusCodes } = require("http-status-codes");

const createAccessCode = async (req, res) => {
    try {
        let { code, expiresAt, validForUsers } = req.body;
        if (!code) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: "Code is required"
            });
        }
        if (!expiresAt) {
            expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }
        const existingCode = await AccessCode.findOne({ code });
        if (existingCode) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: "Access code already exists"
            });
        }
        const accessCode = new AccessCode({ code, expiresAt, validForUsers });
        if (validForUsers && validForUsers.length > 0) {
            accessCode.isForValidUser = true;
        }
        await accessCode.save();
        res.status(StatusCodes.CREATED).json({
            success: true,
            message: "Access code created successfully",
            accessCode
        });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
}

const addUsersToAccessCode = async (req, res) => {
    try {
        const { id, users } = req.body;

        if (!users || users.length === 0) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: "Users are required"
            });
        }
        const accessCode = await AccessCode.findById(id);
        if (!accessCode) {
            return res.status(StatusCodes.NOT_FOUND).json({
                success: false,
                message: "Access code not found"
            });
        }
        let existingUsers = accessCode.validForUsers;
        let newUsers = users;
        if(accessCode.validForUsers.length > 0){
            //check user all already exists
            newUsers = users.filter(user => !existingUsers.includes(user));
            if(newUsers.length === 0){
                return res.status(StatusCodes.BAD_REQUEST).json({
                    success: false,
                    message: "Users already exists"
                });
            }
        }
        if (!accessCode.isForValidUser) {
            accessCode.isForValidUser = true;
        }
        accessCode.validForUsers.push(...newUsers);
        await accessCode.save();
        res.status(StatusCodes.OK).json({
            success: true,
            message: "Users added to access code successfully",
            accessCode
        });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
}

const verifyAccessCode = async (req, res) => {
    try {
        const { code } = req.query;
        const userId = req.user.id
        const accessCode = await AccessCode.findOne({ code });
        if (!accessCode) {
            return res.status(StatusCodes.NOT_FOUND).json({
                success: false,
                message: "Access code not found"
            });
        }
        if (accessCode.expiresAt < Date.now()) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: "Access code has expired"
            });
        }
        if (accessCode.isForValidUser && !accessCode.validForUsers.includes(userId)) {
            return res.status(StatusCodes.FORBIDDEN).json({
                success: false,
                message: "Access code is not valid for this user"
            });
        }
        await accessCode.save();
        res.status(StatusCodes.OK).json(
            {
                success: true,
                message: "Access code verified successfully"
            }
        );
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message
        });
    }
}

const updateAccessCode = async (req, res) => {
    try {
        const { id, code, expiresAt, validForUsers } = req.body;
        const accessCode = await AccessCode.findById(id);
        if (!accessCode) {
            return res.status(StatusCodes.NOT_FOUND).json({
                success: false,
                message: "Access code not found"
            });
        }
        if (code) {
            accessCode.code = code;
        }
        if (expiresAt) {
            accessCode.expiresAt = expiresAt;
        }
        if (validForUsers) {
            accessCode.validForUsers = validForUsers;
        }
        await accessCode.save();
        res.status(StatusCodes.OK).json({
            success: true,
            message: "Access code updated successfully",
            accessCode
        });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
}
module.exports = {
    createAccessCode,
    addUsersToAccessCode,
    verifyAccessCode,
    updateAccessCode
}