const mongoose = require('mongoose');
const propsSchema = new mongoose.Schema({
    id: {
        type: String,
        required: [true, 'Every prop must have an id.']
    },
    name: {
        type: String,
    },
    //array of objects {logId:"",adminRating:"",adminRemark:"",userId:"",userReview:""} of past bookings
    past: {
        type: Array
    },
    available: {
        type: Boolean,
        default: true
    },
    decommissionReason: {
        type: String
    },
    dispatched: {
        type: Boolean,
        default: false
    },
    dispatchTime: {
        type: String
    },
    today: {
        type: Array,
        default: [
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null }]
    },
    tomorrow: {
        type: Array,
        default: [
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null }]
    },
    thirdDay: {
        type: Array,
        default: [
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null },
            { id: null, booked: false, break: null }]
    },
    nightBookingStatus1: {
        type: Boolean,
        default: false
    },
    nightBookingData1: {
        type: Object,
        default: { id: null, otp: null }
    },
    nightBookingStatus2: {
        type: Boolean,
        default: false
    },
    nightBookingData2: {
        type: Object,
        default: { id: null, otp: null }
    },
    nightBookingStatus3: {
        type: Boolean,
        default: false
    },
    nightBookingData3: {
        type: Object,
        default: { id: null, otp: null }
    },
    morningReturn: {
        type: Object,
        default: { userId: null, otp: null }
    },
    dayReturn: {
        type: Date,
        default: null
    }
});
module.exports = mongoose.model('Props', propsSchema);