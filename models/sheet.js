var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var messageSchema = {
    messageId: String,
    messageDate: {type: Date, default: Date.now},
    messageText: String
};

var SheetSchema = new Schema({
    sheetId: {type: String, required: true, unique: true},
    apiKey: String,
    apiSecret: String,
    smsSenderNumber: String,
    brideAndGroom: String,
    eventDate: String,
    eventTime: String,
    venue: String,
    venueLocation: String,
    venueLocationUrl: String,
    venueLatLon: String,
    nameColumnIndex: Number,
    guestCountColumnIndex: Number,
    phoneNumberColumnIndex: Number,
    messageSentColumnIndex: Number,
    approvedGuestCountColumnIndex: Number,
    messagesColumnIndex: Number,
    giftColumnIndex: Number,
    approval: {type: String, default: 'תודה רבה! 😍 בכל שינוי, ניתן לשלוח הודעה נוספת למספר זה. במידה ותרצו מנה צמחונית או טבעונית אנא שלחו "צמחונית" / "טבעונית" בכדי שנוכל להיערך מראש :)'},
    token: {
        expiry_date: Number,
        token_type: String,
        refresh_token: String,
        access_token: String
    },
    guests: [{
        name: String,
        phoneNumber: String,
        guestCount: Number,
        sentMessageCount: Number,
        approvedGuestCount: Number,
        gift: {
            giftType: {type: String},
            giftAmount: {type: Number, min: 0},
            currency: {type: String},
            isDeposited: {type: Boolean}
        },
        messages: {
            toGuest: [messageSchema],
            fromGuest: [messageSchema]
        },
        mealType: String,
        isDisabled: Boolean
    }]
});

SheetSchema.index({sheetId: 1});
SheetSchema.index({sheetId: 1, 'guests.phoneNumber': 1});

module.exports = mongoose.model('Sheet', SheetSchema);