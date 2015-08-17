$(function() {
    function _updateCheckListItem(itemId, failed) {
        var checkListItem = $(itemId)
        var checkListItemIcon = $('span', checkListItem);
        if (failed == false) {
            checkListItem.removeClass('disabled');
            checkListItem.addClass('list-group-item-success');
            checkListItem.removeClass('list-group-item-danger');
            checkListItemIcon.removeClass('glyphicon-remove');
            checkListItemIcon.addClass('glyphicon-ok');
            checkListItemIcon.removeClass('glyphicon-minus');
        }
        else if (failed == undefined) {
            checkListItem.addClass('disabled');
            checkListItem.removeClass('list-group-item-success');
            checkListItem.removeClass('list-group-item-danger');
            checkListItemIcon.removeClass('glyphicon-remove');
            checkListItemIcon.removeClass('glyphicon-ok');
            checkListItemIcon.addClass('glyphicon-minus');
        }
        else {
            checkListItem.removeClass('disabled');
            checkListItem.removeClass('list-group-item-success');
            checkListItem.addClass('list-group-item-danger');
            checkListItemIcon.addClass('glyphicon-remove');
            checkListItemIcon.removeClass('glyphicon-ok');
            checkListItemIcon.removeClass('glyphicon-minus');
        }
    }

    $('#submit').on('click', function() {
        var domain = $('#domain').val()

        if ($.isEmptyObject(domain)) {
            alert('Domain valid is required');
            return;
        }

        var successEl = $('#success');
        var failureEl = $('#failure');
        var checklistEl = $('#checklist');

        if (!successEl.hasClass('hidden')) {
            successEl.addClass('hidden');
        }

        if (!failureEl.hasClass('hidden')) {
            failureEl.addClass('hidden');
        }

        if (!checklistEl.hasClass('hidden')) {
            checklistEl.addClass('hidden');
        }

        $.ajax('/domain/' + domain, {
            type: 'POST'
        })
        .done(function() {
            successEl.removeClass('hidden');
        })
        .fail(function(req) {
            var resp = req.responseJSON;

            failureEl.removeClass('hidden');
            checklistEl.removeClass('hidden');

            _updateCheckListItem('#dns-lookup', resp.badDns);
            _updateCheckListItem('#https-check', resp.httpsFailure);
            _updateCheckListItem('#server-error', resp.serverError);
            _updateCheckListItem('#redirects', resp.redirects);
        });
    });
});
