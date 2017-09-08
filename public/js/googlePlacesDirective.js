angular.module('googlePlaces', [])
    .directive('googlePlaces', ['$timeout', function ($timeout) {
        return {
            require: 'ngModel',
            scope: {
                ngModel: '=',
                onPlaceChanged: '&',
                latLon: '='
            },
            link: function (scope, element) {
                scope.gPlace = new google.maps.places.Autocomplete(element[0]);

                google.maps.event.addListener(scope.gPlace, 'place_changed', function () {
                    var geoComponents = scope.gPlace.getPlace();
                    if (geoComponents) {
                        scope.$apply(function () {
                            scope.ngModel = (scope.gPlace.gm_accessors_.place.Ec || scope.gPlace.gm_accessors_.place.Gc).formattedPrediction;
                            scope.latLon =
                                (geoComponents.geometry && geoComponents.geometry.location && geoComponents.geometry.location.lat() || '') + ',' +
                                (geoComponents.geometry && geoComponents.geometry.location && geoComponents.geometry.location.lng() || '');

                            if (scope.onPlaceChanged) {
                                $timeout(scope.onPlaceChanged);
                            }
                        });
                    }
                });
            }
        };
    }]);


