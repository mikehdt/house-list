var app = app || {};

(function($, Backbone, _){
    'use strict';

    app.PropertyModel = Backbone.Model.extend({
        defaults: {
            list:      '',
            id:        '-1',
            agency:    {},
            price:     'No price set',
            mainImage: '',
            saved:     false
        },

        initialize: function (model) {
            // Sanity check for colours, 7 characters for "#RRGGBB"
            // (could also account for 4 character "#RGB", if we wanted...)
            if (model.agency.brandingColors.primary.length !== 7) {
                // Just doing a check against this so browsers which don't
                // support warn won't completely choke up at this point...
                if (console.warn) {
                    console.warn('Property ID', model.id, 'has an invalid primary hex colour (' + model.agency.brandingColors.primary + ')');
                }

                // Let's assume plain white instead
                model.agency.brandingColors.primary = '#ffffff';
            }

            // Update the parent collection type
            if (this.collection && this.collection.getCollectionType) {
                this.set('list', this.collection.getCollectionType());
            }
        },

        setSaved: function () {
            this.set('saved', true);
        },

        removeSaved: function () {
            this.set('saved', false);
        }
    });
})(jQuery, Backbone, _);
var app = app || {};

(function($, Backbone, _){
    'use strict';

    var ResultsCollection = Backbone.Collection.extend({
        model: app.PropertyModel,

        getCollectionType: function () {
            return 'results';
        }
    });

    app.resultsCollection = new ResultsCollection();
})(jQuery, Backbone, _);
var app = app || {};

(function($, Backbone, _){
    'use strict';

    var SavedCollection = Backbone.Collection.extend({
        model: app.PropertyModel,

        getCollectionType: function () {
            return 'saved';
        }
    });

    app.savedCollection = new SavedCollection();
})(jQuery, Backbone, _);
var app = app || {};

// There is some quirkiness with certain touch devices when you save a result.
// For some reason, the hover state persists longer than it should, and it
// causes some erroneous displays to occur.

(function($, Backbone, _){
    'use strict';

    app.AppView = Backbone.View.extend({
        el: '.properties',

        noSavedTemplate: _.template($('#tpl__no-saved').html()),

        initialize: function () {
            this.$properties__list  = this.$('.properties__list');
            this.$properties__saved = this.$('.properties__saved');

            this.listenTo(app.resultsCollection, 'add',   this.addOneResult);
            this.listenTo(app.savedCollection,   'add',   this.addOneSaved);
            this.listenTo(app.resultsCollection, 'reset', this.addAllResult);
            this.listenTo(app.savedCollection,   'reset', this.addAllSaved);

            // We'll debounce this, just in case there's some crazy trigger
            // happy event firing going on.
            this.listenTo(app.listingsCollection, 'all', _.debounce(this.render, 0));

            // Go off and start loading the data
            this.initCollection();
        },

        initCollection: function () {
            // Send off the request to grab the JSON data...
            // In an ideal situation, perhaps, this might be two lists instead
            // of one? It's a tricky call, as the models for both lists are
            // the same, and you'd want to reduce HTTP requests
            $.ajax({
                type: 'GET',
                cache: false,
                url: './json/listings.json',
                success: $.proxy(this.initCollectionSuccess, this),
                error:   $.proxy(this.initCollectionFail,    this)
            });

            // Note! The original JSON had an errant ; on the end, which would
            // cause jQuery to choke up, as the semi-colon made the JSON to be
            // invalid; we load a local copy which is corrected here, but
            // as it's using $.ajax(), it could theoretically be loaded from
            // a remote endpoint.
            //
            // Also worth noting, the JSON also has an invalid hex colour for
            // item #1, so we check for that in the model and issue a warning
            // notice to the console.
        },

        initCollectionSuccess: function (data) {
            // When AJAX comes back with a happy result, we'll populate the
            // collections as needed
            if (data.results) {
                app.resultsCollection.reset(data.results);
            }

            if (data.saved) {
                app.savedCollection.reset(data.saved);
            }
        },

        initCollectionFail: function (XMLHttpRequest, textStatus, errorThrown) {
            if (console.error && console.group && console.log) {
                console.error('AJAX request failed');
                console.group('Request details');
                console.log('Status:', JSON.stringify(textStatus));
                console.log('Error:', JSON.stringify(errorThrown));
                console.log(JSON.stringify(XMLHttpRequest));
                console.groupEnd();
            }

            return false;
        },

        addOneResult: function (theModel) {
            theModel.trigger('parse');

            var view = new app.PropertyView({ model: theModel });
            this.$properties__list.append(view.render().el);
            this.listenTo(view, 'saved:add', this.addSaved);
            this.listenTo(view, 'saved:remove', this.removeSaved);
        },

        addOneSaved: function (theModel) {
            theModel.trigger('parse');

            var view = new app.PropertyView({ model: theModel });
            this.$properties__saved.append(view.render().el);
            this.listenTo(view, 'saved:add', this.addSaved);
            this.listenTo(view, 'saved:remove', this.removeSaved);

            // Fancy fade-in effect - add a class so it applies, then
            // almost immediately remove it so it triggers the CSS transition
            view.$el.addClass('property--added');
            setTimeout(function(){ view.$el.removeClass('property--added'); }, 0);
        },

        addAllResult: function () {
            // Could do a reset in here to tidy up stuff if necessary?
            this.$properties__list.html('');

            // Iterate over each item and add it to the list
            app.resultsCollection.each(this.addOneResult, this);
        },

        addAllSaved: function () {
            // Could do a reset in here to tidy up stuff if necessary?
            this.$properties__saved.html('');

            // Iterate over each item and add it to the list
            app.savedCollection.each(this.addOneSaved, this);
        },

        addSaved: function (theModel) {
            // Check for the "no saved" message
            if (app.savedCollection.length === 0) {
                this.$properties__saved.html('');
            }

            // Only set a saved property if it isn't already saved
            if (!app.savedCollection.contains(theModel)) {
                theModel.setSaved();

                // Make an clone of the model to save in the saved properties
                // collection, as if we just use theModel directly, any
                // attribute updates will happen in both lists, which we
                // really probably don't want...
                var newModel = theModel.clone();
                newModel.set('list', app.savedCollection.getCollectionType());
                app.savedCollection.add(newModel);
            }
            else {
                console.log('Already added: ID', theModel.get('id'));
            }
        },

        removeSaved: function (theModel, theView) {
            // Stop listening to the view
            this.stopListening(theView);

            // If we have the saved model in our list, we need to mark it
            // as no longer saved
            var listModel = app.resultsCollection.findWhere({ id: theModel.get('id') });

            if (listModel) {
                listModel.removeSaved();
            }

            // Check the count (the view still exists at this point, so check
            // against one less than the current count)
            if (app.savedCollection.length - 1 < 1) {
                this.$properties__saved.append(this.noSavedTemplate);
                this.$properties__saved.addClass('properties__saved--added');
                setTimeout($.proxy(function(){ this.$properties__saved.removeClass('properties__saved--added'); }, this), 0);
            }
        }
    });
})(jQuery, Backbone, _);
var app = app || {};

(function($, Backbone, _){
    'use strict';

    app.PropertyView = Backbone.View.extend({
        tagName:   'li',
        className: 'property',

        events: {
            'click .property__item': 'handleClick'
        },

        template: _.template($('#tpl__property').html()),

        initialize: function (options) {
            this.options = _.extend({}, this, options || {});

            this.listenTo(this.model, 'change',  this.render);
            this.listenTo(this.model, 'destroy', this.remove);
        },

        render: function () {
            this.$el.html(this.template(this.model.toJSON()));

            return this;
        },

        handleClick: function (e) {
            e.preventDefault();

            var modelId = this.model.get('id'),
                modelList = this.model.get('list');

            // Attempted workaround for removing hovered state
            this.$el.blur();

            if (modelList === 'results') {
                this.trigger('saved:add', this.model);
            }
            else if (modelList === 'saved') {
                this.trigger('saved:remove', this.model, this);

                // Remove this view's model from the collection
                app.savedCollection.remove([ modelId ]);

                // Now we need to remove the view item
                this.stopListening();
                this.remove();
            }
        }
    });
})(jQuery, Backbone, _);
var app = app || {};

$(function(){
    'use strict';

    // Implemente FastClick to remove 300ms tap delay
    FastClick.attach(document.body);

    // Bootstrap the app view
    new app.AppView();
});