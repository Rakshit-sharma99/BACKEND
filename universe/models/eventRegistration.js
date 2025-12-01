const mongoose = require("mongoose");

async function defineModels() {
    const eventDB = mongoose.createConnection(process.env.MONGO_URI_EVENTS, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    // Sports Event Schema
    const SportsEventSchema = new mongoose.Schema(
        {
            email: { type: String, required: true },
            studentOrganizationName: { type: String, required: true },
            studentOrganizationEmailAddress: { type: String, required: true },
            ceoFullName: { type: String, required: true },
            ceoPhoneNumber: { type: String, required: true },
            selectedSports: { type: String, required: true },
            teamCaptainName: { type: String, required: true },
            teamCaptainRegistrationNumber: { type: String, required: true },
            teamCaptainContactNumber: { type: String, required: true },
            teamCaptainEmail: { type: String, required: true },
            participationGender: { type: String, required: true },
            teamMemberList: [{
                name: { type: String, required: true },
                registrationNumber: { type: String, required: true },
                contactNumber: { type: String, required: true },
            }],
            undertakingFormUrl: { type: String, required: true },
            userId: { type: mongoose.Types.ObjectId, required: true },
            eventId: { type: mongoose.Types.ObjectId, required: true },
        },
        { timestamps: true }
    );

    // Cultural Event Schema
    const CulturalEventSchema = new mongoose.Schema(
        {
            studentOrganizationName: { type: String, required: true },
            studentOrganizationEmailAddress: { type: String, required: true },
            ceoFullName: { type: String, required: true },
            ceoPhoneNumber: { type: String, required: true },
            selectedCulturalCompetition: { type: String, required: true },
            teamLeaderName: { type: String, required: true },
            teamLeaderRegistrationNumber: { type: String, required: true },
            teamLeaderContactNumber: { type: String, required: true },
            teamLeaderEmail: { type: String, required: true },
            participationType: { type: String, required: true },
            teamMemberList: [{
                name: { type: String, required: true },
                registrationNumber: { type: String, required: true },
                contactNumber: { type: String, required: true },
            }],
            userId: { type: mongoose.Types.ObjectId, required: true },
            eventId: { type: mongoose.Types.ObjectId, required: true },
        },
        { timestamps: true }
    );

    const LiteracyEventSchema = new mongoose.Schema(
        {
            studentOrganizationName: { type: String, required: true },
            studentOrganizationEmailAddress: { type: String, required: true },
            ceoFullName: { type: String, required: true },
            ceoPhoneNumber: { type: String, required: true },
            selectedLiteracyCompetition: { type: String, required: true },
            teamLeaderName: { type: String, required: true },
            teamLeaderRegistrationNumber: { type: String, required: true },
            teamLeaderContactNumber: { type: String, required: true },
            teamLeaderEmail: { type: String, required: true },
            teamMemberList: [{
                name: { type: String, required: true },
                registrationNumber: { type: String, required: true },
                contactNumber: { type: String, required: true },
            }],
            userId: { type: mongoose.Types.ObjectId, required: true },
            eventId: { type: mongoose.Types.ObjectId, required: true },
        },
        { timestamps: true }
    );

    // Esports Event Schema
    const EsportsEventSchema = new mongoose.Schema(
        {
            organizationName: { type: String, required: true },
            organizationEmail: { type: String, required: true },
            ceoName: { type: String, required: true },
            ceoPhone: { type: String, required: true },
            selectedGame: { type: String, required: true },
            teamLeaderName: { type: String, required: true },
            teamLeaderUID: { type: String, required: true },
            teamLeaderContact: { type: String, required: true },
            teamLeaderEmail: { type: String, required: true },
            member1Name: { type: String, required: true },
            member1Registration: { type: String, required: true },
            member1Contact: { type: String, required: true },
            member2Name: { type: String, required: true },
            member2Registration: { type: String, required: true },
            member2Contact: { type: String, required: true },
            member3Name: { type: String, required: true },
            member3Registration: { type: String, required: true },
            member3Contact: { type: String, required: true },
            member4Name: { type: String, required: true },
            member4Registration: { type: String, required: true },
            member4Contact: { type: String, required: true },
            userId: { type: mongoose.Types.ObjectId, required: true },
            eventId: { type: mongoose.Types.ObjectId, required: true },
        },
        { timestamps: true }
    );

    const TechnicalEventSchema = new mongoose.Schema(
        {
            organizationName: { type: String, required: true },
            organizationEmail: { type: String, required: true },
            ceoName: { type: String, required: true },
            ceoPhone: { type: String, required: true },
            selectedCompetition: { type: String, required: true },
            teamLeaderName: { type: String, required: true },
            teamLeaderUID: { type: String, required: true },
            teamLeaderContact: { type: String, required: true },
            teamLeaderEmail: { type: String, required: true },
            userId: { type: mongoose.Types.ObjectId, required: true },
            eventId: { type: mongoose.Types.ObjectId, required: true },
        },
        { timestamps: true }
    );

    const TicketVerificationSchema = new mongoose.Schema(
        {
            ticketId: { type: String, required: true, unique: true },
            userId: { type: mongoose.Types.ObjectId, required: true },
            eventId: { type: mongoose.Types.ObjectId, required: true },
            verifiedBy: { type: mongoose.Types.ObjectId, required: true },
            verificationTime: { type: Date, default: Date.now }
        },
        { timestamps: true }
    );

    TicketVerificationSchema.index({ ticketId: 1 });

    module.exports.TicketVerification = eventDB.model("lpuTicketVerification", TicketVerificationSchema);
    module.exports.TechnicalEvent = eventDB.model("lpuSpardhaTechnicalEvent", TechnicalEventSchema);
    module.exports.SportsEvent = eventDB.model("lpuSpardhaSportsEvent", SportsEventSchema);
    module.exports.CulturalEvent = eventDB.model("lpuSpardhaCulturalEvent", CulturalEventSchema);
    module.exports.LiteracyEvent = eventDB.model("lpuSpardhaLiteracyEvent", LiteracyEventSchema);
    module.exports.EsportsEvent = eventDB.model("lpuSpardhaEsportsEvent", EsportsEventSchema);
}

defineModels();
