var module = angular.module('MainController', [ 'DomainFactory' ]);

module.controller('MainController', [ '$scope', 'DomainFactory', function($scope, domainFactory) {
    $scope.domains = { };

    $scope.beginTest = function() {
        var domain = $('#domain').val();
        var ipa = $('#ipa');

        if (jQuery.isEmptyObject(domain) && jQuery.isEmptyObject(ipa.val())) {
            alert('Domain or IPA required');
            return;
        }

        if (ipa.val()) {
            var ipaFormData = new FormData();
            ipaFormData.append('ipa', ipa[0].files[0]);

            domainFactory.testApp(ipaFormData)
                .then(function(domains) {
                    $scope.domains = domains;
                })
                .catch(function(err) {
                    alert(err);
                });
        }
        else {
            domainFactory.testDomain(domain)
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

    $scope.isEmpty = function(obj) {
        return Object.keys(obj).length == 0;
    }
}]);
