module.exports = {
    port: process.env.PORT || 80,
    mongoDB: process.env.MONGODB_URI,
    defaultCountry: process.env.DEFAULT_COUNTRY || 'IL',
    defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '972'
};