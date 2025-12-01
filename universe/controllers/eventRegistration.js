const { uploadMultipleToS3 } = require("../utils/s3Uploader");
const { checkTicketBought } = require("../middlewares/checkTicket");
const { SportsEvent, CulturalEvent, LiteracyEvent, EsportsEvent, TechnicalEvent, TicketVerification } = require("../models/eventRegistration");
const mongoose = require("mongoose");

exports.uploadFiles = async (req, res) => {
    try {
        const { eventId, eventType } = req.body;
        const userId = req.user.id;

        if (eventType !== "sports" && eventType !== "cultural" && eventType !== "literacy") {
            return res.status(400).json({ message: "Invalid event type" });
        }

        // Check if the user bought the ticket
        // const isBought = await checkTicketBought(userId, eventId);
        // if (!isBought) {
        //     return res.status(403).json({ message: "User has not bought a ticket" });
        // }

        if (!req.files) {
            return res.status(400).json({ message: "No files to upload" });
        }

        // Upload files to S3
        const uploadedFiles = await uploadMultipleToS3(req.files, `public/events/spardha/verify/${eventType}/${userId}`);

        return res.status(200).json({ files: uploadedFiles });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "File upload failed" });
    }
};

exports.submitEventRegistration = async (req, res) => {
    try {
        const {
            eventType, // "sports" or "cultural" or "literacy"
            email,
            studentOrganizationName,
            studentOrganizationEmailAddress,
            ceoFullName,
            ceoPhoneNumber,
            selectedSports, // Only for sports events
            selectedCulturalCompetition, // Only for cultural events
            selectedLiteracyCompetition, // Only for literacy events
            undertakingFormUrl, // Only for sports events
            eventId,
            teamLeaderName,
            participationGender,
            teamLeaderRegistrationNumber,
            teamLeaderContactNumber,
            teamLeaderEmail,
            participationType, // Only for cultural events
            teamMemberList, // Team members array for all types
        } = req.body;
        const userId = req.user.id;
        console.log("Data: ",req.body);

        // Check if user has bought the ticket
        // const isBought = await checkTicketBought(userId, eventId);
        // if (!isBought) {
        //     return res.status(403).json({ message: "User has not bought a ticket" });
        // }

        let EventModel;
        let eventData = {
            studentOrganizationName,
            studentOrganizationEmailAddress,
            ceoFullName,
            ceoPhoneNumber,
            userId,
            eventId,
        };

        if (teamMemberList) {
            eventData.teamMemberList = teamMemberList;
        }

        if (eventType === "sports") {
            EventModel = SportsEvent;
            // Add sports-specific fields
            eventData.email = email;
            eventData.selectedSports = selectedSports;
            eventData.undertakingFormUrl = undertakingFormUrl;
            eventData.teamCaptainName = teamLeaderName;
            eventData.teamCaptainRegistrationNumber = teamLeaderRegistrationNumber;
            eventData.teamCaptainContactNumber = teamLeaderContactNumber;
            eventData.teamCaptainEmail = teamLeaderEmail;
            eventData.participationGender = participationGender;
        } else if (eventType === "cultural") {
            EventModel = CulturalEvent;
            // Add cultural-specific fields
            eventData.selectedCulturalCompetition = selectedCulturalCompetition;
            eventData.teamLeaderName = teamLeaderName;
            eventData.teamLeaderRegistrationNumber = teamLeaderRegistrationNumber;
            eventData.teamLeaderContactNumber = teamLeaderContactNumber;
            eventData.teamLeaderEmail = teamLeaderEmail;
            eventData.participationType = participationType;
        } else if (eventType === "literacy") {
            EventModel = LiteracyEvent;
            // Add literacy-specific fields
            eventData.selectedLiteracyCompetition = selectedLiteracyCompetition;
            eventData.teamLeaderName = teamLeaderName;
            eventData.teamLeaderRegistrationNumber = teamLeaderRegistrationNumber;
            eventData.teamLeaderContactNumber = teamLeaderContactNumber;
            eventData.teamLeaderEmail = teamLeaderEmail;
        } else {
            return res.status(400).json({ message: "Invalid event type" });
        }

        const newRegistration = new EventModel(eventData);
        const validationError = newRegistration.validateSync();
        if (validationError) {
            return res.status(400).json({
                message: "Missing required fields",
                errors: validationError.errors
            });
        }

        await newRegistration.save();
        return res.status(201).json({ message: "Registration successful" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Failed to save event data" });
    }
};

exports.registerEsportsEvent = async (req, res) => {
    try {
        const userId = req.user.id;
        const { eventId } = req.body;

        // Check if the user bought the ticket
        // const isBought = await checkTicketBought(userId, eventId);
        // if (!isBought) {
        //     return res.status(403).json({ message: "User has not bought a ticket" });
        // }

        const newEsportsEvent = new EsportsEvent({
            ...req.body,
            userId: userId,
            eventId: eventId,
        });

        await newEsportsEvent.save();
        res.status(201).json({ message: "Esports event registered successfully", data: newEsportsEvent });
    } catch (error) {
        console.error("Error registering esports event:", error);
        res.status(500).json({ message: "Failed to register esports event", error: error.message });
    }
};

exports.registerTechnicalEvent = async (req, res) => {
    try {
        const userId = req.user.id;
        const { eventId } = req.body;

        // // Check if the user bought the ticket
        // const isBought = await checkTicketBought(userId, eventId);
        // if (!isBought) {
        //     return res.status(403).json({ message: "User has not bought a ticket" });
        // }

        const newTechnicalEvent = new TechnicalEvent({
            ...req.body,
            userId: userId,
            eventId: eventId,
        });

        await newTechnicalEvent.save();
        res.status(201).json({ message: "Technical event registered successfully", data: newTechnicalEvent });
    } catch (error) {
        console.error("Error registering technical event:", error);
        res.status(500).json({ message: "Failed to register technical event", error: error.message });
    }
};

// Store a verified ticket
exports.storeVerifiedTicket = async (req, res) => {
    try {
        const { ticketId, eventId } = req.body;
        const userId = req.user.id;
        
        // Validate required fields
        if (!ticketId || !userId || !eventId) {
            return res.status(400).json({ 
                message: "Missing required fields: ticketId, userId, and eventId are required" 
            });
        }

        // Check if this ticket is already verified
        const existingTicket = await TicketVerification.findOne({ ticketId });
        if (existingTicket) {
            return res.status(409).json({ 
                message: "This ticket has already been verified",
                verified: true,
                verificationTime: existingTicket.verificationTime
            });
        }

        // Store the verification record
        const verifiedTicket = new TicketVerification({
            ticketId,
            userId: mongoose.Types.ObjectId(userId),
            eventId: mongoose.Types.ObjectId(eventId),
            verifiedBy: req.user.id // Assumes req.user is populated from authentication middleware
        });

        await verifiedTicket.save();
        
        res.status(201).json({ 
            message: "Ticket verification stored successfully",
            data: verifiedTicket
        });
    } catch (error) {
        console.error("Error storing ticket verification:", error);
        res.status(500).json({ 
            message: "Failed to store ticket verification", 
            error: error.message 
        });
    }
};

// Check if a ticket is verified
exports.checkTicketVerification = async (req, res) => {
    try {
        const { ticketId } = req.params;
        
        if (!ticketId) {
            return res.status(400).json({ message: "Ticket ID is required" });
        }

        const verifiedTicket = await TicketVerification.findOne({ ticketId });
        
        if (verifiedTicket) {
            return res.status(200).json({
                verified: true,
                verificationTime: verifiedTicket.verificationTime,
                userId: verifiedTicket.userId,
                eventId: verifiedTicket.eventId
            });
        } else {
            return res.status(200).json({
                verified: false,
                message: "This ticket has not been verified yet"
            });
        }
    } catch (error) {
        console.error("Error checking ticket verification:", error);
        res.status(500).json({ 
            message: "Failed to check ticket verification", 
            error: error.message 
        });
    }
};
