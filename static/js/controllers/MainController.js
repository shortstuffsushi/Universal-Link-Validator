var module = angular.module('MainController', [ 'DomainFactory' ]);

module.controller('MainController', [ '$scope', 'DomainFactory', function($scope, domainFactory) {
    $scope.domains = { };
    $scope.domainInputVal = '';
    $scope.bundleIdentifier = '';
    $scope.teamIdentifier = '';
    $scope.ipaInput = false;
    $scope.filename = '';
    $scope.allowUnencrtyped = false;

    $scope.keyUp = function(evt) {
        if (evt.keyCode == 13) {
            $scope.beginTest();
        }
    };

    $scope.cleanDomain = function() {
        var url = $scope.domainInputVal;
        url = url.replace(/https?:\/\//, '');
        url = url.replace(/\/.*/, '');
        $scope.domainInputVal = url;
    };

    $scope.beginTest = function() {
        if (!$scope.domainInputVal.length && !$scope.ipaInput) {
            alert('Domain or IPA required');
            return;
        }

        if ($scope.ipaInput) {
            var ipaFormData = new FormData();
            ipaFormData.append('ipa', $scope.ipaInput);

            domainFactory.testApp($scope.appname, ipaFormData)
                .then(function(resp) {
                    $scope.appInfo = resp.appInfo;
                    $scope.domains = resp.domains;
                })
                .catch(function(err) {
                    alert(err);
                });
        }
        else {
            $scope.cleanDomain();

            domainFactory.testDomain($scope.domainInputVal, $scope.bundleIdentifier, $scope.teamIdentifier)
                .then(function(domains) {
                    $scope.domains = domains;
                })
                .catch(function(err) {
                    alert(err);
                });
        }
    };

    $scope.listGroupItemClassForValue = function(badValue) {
        if (badValue === true) {
            return 'list-group-item-danger';
        }
        else if (badValue === false) {
            return 'list-group-item-success';
        }

        return 'disabled';
    };

    $scope.glyphiconClassForValue = function(badValue) {
        if (badValue === true) {
            return 'glyphicon-remove';
        }
        else if (badValue === false) {
            return 'glyphicon-ok';
        }

        return 'glyphicon-minus';
    };

    $scope.aasaIsEntirelyValid = function(results) {
        return results != undefined && results.jsonValid && (results.bundleIdentifierFound === true || results.bundleIdentifierFound === undefined);
    };

    $scope.aasaValidButIdentfiersDontMatch = function(results) {
        return results != undefined && results.bundleIdentifierFound === false;
    }

    $scope.aasaValidButFormatInvalid = function(results) {
        return results != undefined && results.jsonValid === false;
    };

    $scope.isEmpty = function(obj) {
        return obj === undefined || Object.keys(obj).length == 0;
    };

    $scope.prettyPrintAASA = function(aasa) {
        return JSON.stringify(aasa, null, 4);
    };
}]);
