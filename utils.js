const config = require('./config');

exports.sanitizePhoneNumber = function (phoneNumber) {
    return phoneNumber ? phoneNumber
        .replace(/^0/, '')
        .replace(/-/g, '')
        .replace('+', '')
        .replace(/\s+/g, '')
        .replace(new RegExp('^' + config.defaultCountryCode), '') : '';
};

exports.flattenObjectField = function (object, field) {
    if (object[field]) {
        for (var key in object[field]) {
            if (object[field].hasOwnProperty(key)) {
                object[field + '.' + key] = object[field][key];
                delete object[field][key];
            }
        }
    }
};

exports.getObjectValueByPath = function (object, path) {
    if (/\./.test(path)) {
        var pathParts = path.split('.');
        return this.getObjectValueByPath(object[pathParts.shift()], pathParts);
    } else if (path instanceof Array) {
        if (path.length == 1) {
            path = path[0];
        } else {
            return this.getObjectValueByPath(object[path.shift()], path);
        }
    }

    return object[path];
};

exports.setObjectValueByPath = function (object, path, value) {
    if (/\./.test(path)) {
        var pathParts = path.split('.');
        this.setObjectValueByPath(object[pathParts.shift()], pathParts, value);
    } else if (path instanceof Array) {
        if (path.length == 1) {
            object[path[0]] = value;
        } else {
            this.setObjectValueByPath(object[path.shift()], path, value);
        }
    } else {
        object[path] = value;
    }
};