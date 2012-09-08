
// temporal map control
//Plugin code goes here.
(function() {
	jq.widget("ui.f1_temporal", {
		
		// pre-set options for this widget
		options : {
			showingOverview : true,
			maxOverviewBins : 500,
			maxFocusBins : 500,
			stepPercentage : .015,
			playInterval : 300,
			allowOverview : true,
			playMode : "range"
		},
		
		// years, months, days, hours, minutes
		_resolutions: {
			"second"  : 1000,
      "minute"  : 1000*60,
      "hour"    : 1000*60*60,
      "day"     : 1000*60*60*24,
      "month"   : 1000*60*60*24*30,
      "year"    : 1000*60*60*24*365
		},
		
		/**
		 * automatically called on a new instance of this widget
		 */
		_create : function()
		{
			
		},
		
		/**
		 * automatically called on a new instance of this widget, AFTER _create()
		 */
		_init : function()
		{
			this._isPlaying = false;
			this._isDragging = false;
			this.map = this.options.map;
      this.map_el = jq('#'+this.options.map.options.dom_id);
			this._playMode = this.options.playMode;
			this._bins = {};
			this._maxCounts = {};
			
			this._resolutionDirty = true;
			this._timespanDirty = true;
			
			// crete the widget content
			this._createMarkup();
			this._finishUI();
			this._wire();
			this._initCharts();
		  this.loaded = false;
		},
		
		/**
		 * add all elements and instantiate any jquery UI elements
		 */
		_createMarkup : function()
		{
			this.element.html("");
       		var controls = jq("<div id='temporal_controls'></div>").appendTo(this.element);
       		
       		// focus / header
			controls.append(
				'<div id="focusControls" class="header">\
					<button class="play" id="play">\
					  <div id="playInternal"></div>\
					</button>\
					<h1 id="temporalTitle" class="play" style="">PLAY</h1>\
					<div id="playModeChooser" class="fg-buttonset fg-buttonset-single">\
						<button class="fg-button ui-state-default ui-priority-primary ui-corner-left" value="range">range</button>\
						<button class="fg-button ui-state-default ui-priority-primary ui-corner-right" value="cumulative">cumulative</button>\
					</div>\
					<button id="show_hide" class="hide"></button>\
					<div id="focusRange"></div>\
				</div>'
			);
			
			var chartsContainer = jq( '<div id="chartsContainer"></div>' ).appendTo( controls );
			
			chartsContainer.append(
				'<div id="focusContainer">\
					<div id="pageHolder_left">\
						<button id="page_left"></button>\
					</div>\
					<div id="focusChartHolder">\
						<div id="focusAnnotation"></div>\
						<div id="focus"></div>\
						<div id="resolutionChooser" class="fg-buttonset fg-buttonset-single">\
							<button id="second" class="fg-button ui-state-default ui-priority-primary ui-corner-left" value="second">sec</button>\
							<button id="minute" class="fg-button ui-state-default ui-priority-primary" value="minute">min</button>\
							<button id="hour" class="fg-button ui-state-default ui-priority-primary" value="hour">hh</button>\
							<button id="day" class="fg-button ui-state-default ui-priority-primary" value="day">dd</button>\
							<button id="month" class="fg-button ui-state-default ui-priority-primary" value="month">mm</button>\
							<button id="year" class="fg-button ui-state-default ui-priority-primary ui-corner-right" value="year">yy</button>\
						</div>\
						<div id="focusTip"></div>\
					</div>\
					<div id="pageHolder_right">\
						<button id="page_right"></button>\
					</div>\
				</div>'
			);
			
			// overview
			chartsContainer.append( 
       			'<div id="overviewContainer">\
       				<div id="overviews">\
       					<div id="overviewAnnotation"></div>\
       					<div id="overview"></div>\
       					<div id="overviewBlockers"></div>\
       					<div id="overviewSlider"></div>\
       				</div>\
				</div>\
				<div id="overviewControls">\
					<button id="hideOverview" class="hide"></button>\
					<h1 id="overviewTitle">OVERVIEW</h1>\
					<p id="overviewRange">(full range: <span id="overviewRangeSpan"></span>)</p>\
				</div>'
			);
		 
		},
		
		/**
		 * apply jQuery behaviors and UI elements
		 */
		_finishUI : function()
		{
			var self = this;
			if (self._playMode == 'range') {
			  jq(".fg-button.ui-corner-left").addClass("ui-state-active");
			  jq(".fg-button.ui-corner-right").removeClass("ui-state-active");
			}
			if (self._playMode == 'cumulative') {
        jq(".fg-button.ui-corner-right").addClass("ui-state-active");
        jq(".fg-button.ui-corner-left").removeClass("ui-state-active");
      }
      
			jq(".fg-button:not(.ui-state-disabled)")
				.hover(
					function(){ 
						jq(this).addClass("ui-state-hover"); 
					},
					function(){ 
						jq(this).removeClass("ui-state-hover"); 
					}
				)
				.mousedown(
					function(){
						if ( jq(this).hasClass( 'ui-state-disabled' ) ) return;
						
						jq(this).parents('.fg-buttonset-single:first').find(".fg-button.ui-state-active").removeClass("ui-state-active");
						if( jq(this).is('.ui-state-active.fg-button-toggleable, .fg-buttonset-multi .ui-state-active') ){ jq(this).removeClass("ui-state-active"); }
						else { jq(this).addClass("ui-state-active"); }	
					}
				)
				.mouseup(
					function(){
						if(! jq(this).is('.fg-button-toggleable, .fg-buttonset-single .fg-button,  .fg-buttonset-multi .fg-button') ){
							jq(this).removeClass("ui-state-active");
						}
					}
			);	
      
			jq( "div#overviewSlider" ).slider(
			{
				range : true,
				min : 0,
				max : 100,
				values : [10, 50],
				step : this._resolutions[ 'minute' ],
				slide : function(event, ui)
				{
					if ( (ui.values[1] - ui.values[0] ) < self._resolutions[ 'minute' ] )
					{
						return false;
					}
					
					self.focusTimespan.min = ui.values[0];
					self.focusTimespan.max = ui.values[1];
          self.temporal_show_state({range:{min: self.focusTimespan.min, max: self.focusTimespan.max}})
					
					self._updateFocusIndicators();
					
					self._timespanDirty = true;
					self._updateFocusRepresentations( true );
				},
				
				stop : function(event, ui)
				{
					self._timespanDirty = true;
					self._updateFocusRepresentations( true );
          self.map_el.trigger('onTemporalChange');
				}
			});
			
			jq( "div#overviewSlider" ).css( "visibility", "hidden" );
			
			// what can we do with the ui-slider-range?
			jq( "div#overviewSlider div.ui-slider-range" ).mousedown( function( event )
			{
				event.stopPropagation();
			});
			
			jq( "div#overviewSlider div.ui-slider-range" ).draggable( {
				containment: 'parent',
				axis: 'x',
				drag: function( e, ui )
				{
					var x = ui.position.left;
					var fullWidth = jq( "div#overviewSlider" ).width();
					var rangeWidth = jq( "div#overviewSlider div.ui-slider-range" ).width();
										
					self.focusTimespan.min = self.overviewTimespan.min + ( x / fullWidth ) * ( self.overviewTimespan.max - self.overviewTimespan.min ); 
					self.focusTimespan.max = self.overviewTimespan.min + ( ( x + rangeWidth ) / fullWidth ) * ( self.overviewTimespan.max - self.overviewTimespan.min ); 
					
					self._updateSlider();
					self._updateFocusIndicators();
					
					self._timespanDirty = true;
					self._updateFocusRepresentations( false );
				},
				stop: function(e, ui )
				{
					self._timespanDirty = true;
					self._updateFocusRepresentations( false );
          self.map_el.trigger('onTemporalChange');
				}
			});
			
		},
		
		highlightFeatureBars : function( features )
		{
			var att = this.map.getLayerTemporalAttribute(2);
			var bins = this._bins[this.focusResolution];
			var date, ind;
			var highlightedBins = [];
			for ( var i=0; i<features.length; i++)
			{
				date = new Date(features[i][att].time);
				ind = Math.round( ( date.getTime() - this.overviewTimespan.min ) / this._resolutions[ this.focusResolution ] );
				
				highlightedBins.push(bins[ind]);
				bins[ind].bar.attr({fill : "#fefe00", 'stroke' : '#666' });
			}
			
			self.map_el.one( 'mousedown', { 'self' : this, 'bins' : highlightedBins }, this.onMouseDownWhileHighlighted );
		},
		
		/**
		 * binds behaviors to UI interactions
		 */
		_wire : function()
		{
			var self = this;
			
	    self.map_el.one("onTemporalReady", function() { self._onTemporalReady(); });
	    
	    /*self.map_el.bind('temporalHidden', function() {
	      self.map.setMapStyle({temporal: {visible:false}})
	    })
	    
	    self.map_el.bind('temporalVisible', function() {
        self.map.setMapStyle({temporal: {visible:true}})
      })*/
	   
	    /*self.map_el.bind("onFeatureSelected", function(event, featureText)
	    {
	    	self.highlightFeatureBars( JSON.parse(featureText) );
	    });*/
	    
	    self.map_el.bind("onLayerRemoved", function(e, obj) {
        if (self.map.getLayerTemporalAttribute(obj.layer.guid)){ 
          self._delete();
        }
      });
	       
	    // hide/show overview histogram
			jq( "button#hideOverview" ).click( function() {
				if ( jq( "button#hideOverview" ).hasClass( "show" ) )
				{
					jq( "div#overviewContainer" ).slideDown(500);
					jq( "div#temporal" ).animate( { 'height' : '189px' }, 500 );
					jq( "button#hideOverview" ).removeClass( "show" );
					self.temporal_show_state({overview:true})
				}
				else
				{
					jq( "div#overviewContainer" ).slideUp(500);
					jq( "div#temporal" ).animate( { 'height' : '144px' }, 500 );
					jq( "button#hideOverview" ).addClass( "show" );
					self.temporal_show_state({overview:false})
				}
			});
			
			// page right
			jq( "button#page_right" ).click( function(event)
			{
				self.pageRight();
			});
			
			// page left
			jq( "button#page_left" ).click( function(event)
			{
				self.pageLeft();
			});
			
			// play/pause
			jq( ".play" ).click( function( event )
			{
				if ( self._isPlaying ) {
					self.pause();
					jq( 'h1#temporalTitle' ).html( 'PLAY' );
				}
				else 
				{
					self.play();
					jq( 'h1#temporalTitle' ).html( 'PAUSE' );
				}
			});

			
			jq( "div#playModeChooser button" ).click( function( event )
			{
				self.setPlayMode( event.target.value );
			});
			
			jq( "div#resolutionChooser button" ).click( function( event )
			{
				if ( jq( event.target ).hasClass( 'ui-state-disabled' ) ) return;
				
				// hide the current set
				self.focusBarSets[ self.focusResolution ].hide();
				
				self.focusResolution = event.target.id;
				
				self._resolutionDirty = true;
				
				// if we have the bins, just set resolution and draw
				if ( self._bins[ self.focusResolution ] )
				{
					self._updateFocusChart();
				}
				
				// if not, set temporal resolution on the map and wait
				else
				{
					self.map_el.one("onTemporalReady", function() { self._onFocusBins();  self._updateFocusChart(); });
    		  self.map.setTemporalResolution( self.focusResolution );
				}
			});
		
	
			jq( "div#resolutionChooser" ).hide();
			jq( "div#focusChartHolder" ).mouseover( function()
			{
				jq( "div#resolutionChooser" ).show();
			});
			jq( "div#focusChartHolder" ).mouseout( function()
			{
				jq( "div#resolutionChooser" ).hide();
			});
			
			jq( "button#show_hide" ).click( function( event )
			{
				var $button = jq( event.target );
				
				if ( $button.hasClass( 'hide' ) )
				{
					self.collapse();
				}
				else
				{
					self.expand();
				}
			});
			
			jq( "div#overviewContainer" ).mouseover( function()
			{
				jq( "div#overviewSlider" ).css( "visibility", "visible" );
			});
			
			jq( "div#overviewContainer" ).mouseout( function()
			{
				jq( "div#overviewSlider" ).css( "visibility", "hidden" );
			});


		},
    
    get_temporal_show_state: function() {
      var self = this;
      return self.map_el.temporal_state;
    },
    
    temporal_show_state: function(params) {
      var self = this;
      if (!self.map_el.temporal_state) self.map_el.temporal_state = {};
      self.map_el.temporal_state = jq.extend(self.map_el.temporal_state, params)  
    },
    
    setTemporalStyle: function(params) {
      var self = this;
      if (params.playMode) {
        var mode = params.playMode;
        this._playMode = mode;
        if (mode == 'range') {
          jq(".fg-button.ui-corner-left").addClass("ui-state-active");
          jq(".fg-button.ui-corner-right").removeClass("ui-state-active");
        } else {
          jq(".fg-button.ui-corner-right").addClass("ui-state-active");
          jq(".fg-button.ui-corner-left").removeClass("ui-state-active");
        }
        this.temporal_show_state({playMode:mode})
      }
      if (params.visible == true) {
        jq(document).f1_map_handler('overlay_to', 'temporal', true);
        this.temporal_show_state({visible:true})
      }
      if (params.visible == false) {
        jq('#temporal').css('z-index', '51')
        jq(document).f1_map_handler('overlay_to', 'temporal', false);
        this.temporal_show_state({visible:false})
      }
      if (params.range) {
        var range = params.range;
        this.focusTimespan = {}
        if (isNaN(range.min)) {
          var min = Date.parse(range.min);
          var max = Date.parse(range.max);
        } else {
          var min = range.min;
          var max = range.max;
        }
        this.focusTimespan.min = min;
        this.focusTimespan.max = max;
        this.map.setTimeSpan( new Date( this.focusTimespan.min ), new Date( this.focusTimespan.max ) );
        this._updateSlider();
        this._updateFocusIndicators();
        this._updateFocusRepresentations(true);
        self.temporal_show_state({range:{min: self.focusTimespan.min, max: self.focusTimespan.max}})
      }
      if (params.expanded == true) this.expand();
      if (params.expanded == false) this.collapse();
      if (params.overview == false) {
        jq( "div#overviewContainer" ).slideUp(500);
        jq( "div#temporal" ).animate( { 'height' : '144px' }, 500 );
        jq( "button#hideOverview" ).addClass( "show" );
        this.temporal_show_state({overview:false})
      }
      if (params.overview == true) {
        jq( "div#overviewContainer" ).slideDown(500);
        jq( "div#temporal" ).animate( { 'height' : '189px' }, 500 );
        jq( "button#hideOverview" ).removeClass( "show" );
        this.temporal_show_state({overview:true})
      } 
    },
    
    refresh: function(guid){
      var self = this;
      var timeslots = this.map.getTimeSlots().length;
      if (timeslots) {
        if (jq('.f1-layout-center-southcenter').is(':visible')) F1.Layout.instances['layout'].inner_center.close("south");
        jq(document).f1_map_handler('enable_overlay', 'temporal');
        jq(document).f1_map_handler('overlay_to', 'temporal', true);
        jq(self.element).fadeIn();
        if (self.loaded){
          // must reload the timeline
          this._resolutionDirty = true;
          this._timespanDirty = true;
          this._attributeDirty = true;
          this._createMarkup();
          this._finishUI();
          this._wire();
          this._initCharts(true);
          self.map_el.trigger('onTemporalReady');
        }
      } else {
        self._delete();
      }
    },

    /**
      Updates the time with new features
    */
    update: function(){
      self.map_el.one('onTemporalReady',function(){
        //this._onFocusBins();
        var slots = F1.Maker.current_map.getTimeSlots();
        //this._addBins(slots, this.overviewResolution);
        //this._addBins(slots, this.focusResolution); 
        //this._timespanDirty = true;
        //this._updateFocusChart();
        //this._drawOverview();
        //this._updateFocusIndicators();
        //this._updateSlider();
        //this._updateFocusRepresentations(true);
      });
      //F1.Maker.current_map.setTemporalResolution(this.overviewResolution);
    },

    // hides the timeline element and re-inits the temporal controls
		_delete: function() {
      var self = this;
      if (self.options.allowOverview == true) {
        jq(self.element).fadeOut(function() {
          self.pause(); //temp
          jq(document).f1_map_handler('disable_overlay', 'temporal');
          jq('#temporal').f1_temporal({map:self.map});
        }); 
        return;
      }
    },
 	
		setPlayMode : function( mode )
		{
			this._playMode = mode;
		  if (mode == 'range') {
        jq(".fg-button.ui-corner-left").addClass("ui-state-active");
        jq(".fg-button.ui-corner-right").removeClass("ui-state-active");
      } else {
        jq(".fg-button.ui-corner-right").addClass("ui-state-active");
        jq(".fg-button.ui-corner-left").removeClass("ui-state-active");
      }
			this.temporal_show_state({playMode:mode})
			// style carets accordingly
		},
		
		/**
		 * set up the raphael objects and bar groups that we'll use later
		 */
		_initCharts : function(reload)
		{
			this.overviewAnnotationCanvas = Raphael("overviewAnnotation", jq( "#overviewAnnotation" ).width(), jq( "#overviewAnnotation" ).height() );
			this.overviewCanvas = Raphael("overview", jq("#overview").width(), jq("#overview").height());
	    this.overviewBars = this.overviewCanvas.set();
	    this.highlightBars = this.overviewCanvas.set();
	    
	    this.obscuringCanvas = Raphael("overviewBlockers", jq("#overviewBlockers").width(), jq("#overviewBlockers").height());
	    
	    this.obscuringBars = this.obscuringCanvas.set();
	    
	    this.obscuringBars.push( this.obscuringCanvas.rect(-1,0,10,jq("#overview").height()), this.obscuringCanvas.rect(300,0,10,jq("#overview").height()) );
	    this.obscuringBars.push( this.obscuringCanvas.rect( 0, jq( "#overview" ).height() - 1, 10, 10 ) );
	    
	    this.obscuringBars.attr( { fill: "#444", 'fill-opacity' : .1, stroke : "#666" } );
	    
	    this.focusAnnotationCanvas = Raphael( "focusAnnotation", jq( "#focusAnnotation" ).width(), jq( "#focusAnnotation" ).height() );
	   
	    this.focusCanvas = Raphael("focus", jq( "#focus" ).width(), jq( "#focus" ).height());
			if (!reload) {
        this.focusBarSets = {};
      }
		},
		
		/**
		 * returns the next _coarsest_ resolution compared to the passed-in resolution
		 */
		_next_resolution: function(resolution) {
        	var next = false;
        	var last_res;
        	jq.each(this._resolutions, function(name, val) {
          		last_res = name;
          		if (next) {
            		return false;            
          		}	
          		if (resolution == name)
          		{
            		next = true;
          		}
        	});
        	return last_res;
    	},
    	
    	/**
    	 * returns the next _finest_ resolution compared to the passed-in resolution
    	 */
    	_prev_resolution : function(resolution)
    	{
    		var prev_res;
    		jq.each( this._resolutions, function( name, val )
    		{
    			if ( resolution == name )
    			{
    				return false;
    			}
    			prev_res = name;
    		});
    		return prev_res;
    	},
    

    	/**
    	 * called when overview bins are loaded (may be called again if too many bins)
    	 */
    	_onTemporalReady : function(bins)
    	{
    		var self = this;
    		
    		// determine overview resolution
    		var bins = (bins) ? bins : this.map.getTimeSlots();
    		var res = this.map.getTemporalResolution();
    		var timespan = {
	          min: bins[0].timestamp.getTime(),
	          max: bins[bins.length-1].timestamp.getTime() + this._resolutions[ res ]
	        };
    		
    		var numBins = ( timespan.max - timespan.min ) / this._resolutions[ res ];
    
    		
    		if ( numBins > this.options.maxOverviewBins )
    		{
    			var callMethod = function()
    			{
        		self.map_el.one("onTemporalReady", function() { self._onTemporalReady() });
	    			res = self._next_resolution( res );
	    			self.map.setTemporalResolution( res );
    			}
    			
    			window.setTimeout( function(){ callMethod() }, 100);
       		}
    		else
    		{
    			this.overviewResolution = res;
    			this.overviewTimespan = timespan;
    			
    			this._addBins( bins, res );
    			
    			// draw overview
    			this._drawOverview();
    			this._updateChartAnnotation( this.overviewAnnotationCanvas, this.overviewTimespan, 5, "#DDD" );
          
    			jq( '#overviewRangeSpan' ).html( this._getDateRangeText( this.overviewTimespan, false ) );
    			
    			// set the slider min, max, and step !!!
    			jq( "div#overviewSlider" ).slider( "option", {
    				min : this.overviewTimespan.min,
    				max : this.overviewTimespan.max
    			});
    			
    			// now for the focus bins
    			this.element.fadeIn('slow', function()
    			{
    				self.focusResolution = self._prev_resolution( res );
    				if (!self.focusResolution) self.focusResolution = res;
    				jq( "div#resolutionChooser button#"+self.focusResolution ).addClass( "ui-state-active" );
					
    				self.focusTimespan = self._getInitialFocusTimespan();
    			
            if (!self.loaded) {
    				  self.map_el.one("onTemporalReady", function(){
    					  // process bins
    					  var style = self.map.getMapStyle();
    					  if (style.temporal) {
    					    if (style.temporal.range) {
    					      var range = style.temporal.range;
                    self.focusTimespan.min = range.min;
                    self.focusTimespan.max = range.max;
                    self.temporal_show_state({range:{min: self.focusTimespan.min, max: self.focusTimespan.max}})
                  }
                }
    					  self._onFocusBins();  
    					  self._updateFocusIndicators();
    					  self._updateSlider();
    					  self._updateFocusRepresentations(true);
    					  //self.showTemporal(true);
    					  /*var style = self.map.getMapStyle();
                if (style.temporal) {
                  if (style.temporal.visible == true) {
                    self.map.setMapStyle({temporal: {visible:true}})
                  }
                }
                if (!style.temporal) {
                  self.map.setMapStyle({temporal: {visible:false}})
                }*/
                jq('#bottom_overlays').show();
    				  });
    				  self.map.setTemporalResolution( self.focusResolution );
              self.loaded = true;
            } else {
              setTimeout( function(){
                self._onFocusBins();  
                self._updateFocusIndicators();
                self._updateSlider();
                self._updateFocusRepresentations(true);
              }, 1000)
    				  //self.map.setTemporalResolution( self.focusResolution );
            }
    			});
          
    		}
    	},
    	
    	/*showTemporal: function(params) {
    	  if (params == true) jq(document).f1_map_handler('overlay_to', 'temporal', true);
    	  if (params == false) {
    	    jq('#temporal').css('z-index', '51')
    	    jq(document).f1_map_handler('overlay_to', 'temporal', false);
    	  }
    	},*/
    	
    	/**
    	 * process and store bins for a given resolution
    	 */
    	_addBins : function( bins, resolution )
    	{    		
    		var processedBins = [];
    		var ms = this._resolutions[ resolution ];
    		var minTime = this.overviewTimespan.min;
    		var max = -999;
    		var ind = 0;
    		// figure max
    		jq.each( bins, function( ind, bin )
    		{
    			if ( bin.count > max )
    			{
    				max = bin.count;
    			}
    			
    			bin.utc = bin.timestamp.getTime();
    			
    			ind = Math.round( ( bin.utc - minTime ) / ms );
    			
    			processedBins[ ind ] = bin;
    		});
    		
    		this._bins[resolution] = processedBins;
    		this._maxCounts[resolution] = max;
    	},
    	
    	/**
    	 * called whenever new focus bins are retrieved from the API
    	 */
    	_onFocusBins : function()
    	{
    		this._addBins( this.map.getTimeSlots(), this.map.getTemporalResolution() );
    	},
		
		/**
		 * draws the overview histogram
		 */
		_drawOverview : function(fill)
		{	
			var bins = this._bins[this.overviewResolution];
	        	        	        
	    var overviewRange = this.overviewTimespan.max - this.overviewTimespan.min;
	    // need to know the max count
	    var maxCount = this._maxCounts[this.overviewResolution];
	    
	    // bucket size in ms
	    var bucket_size = this._resolutions[ this.overviewResolution ];
	    var num_buckets = Math.ceil(overviewRange / bucket_size);
	    
	    var bucket_width = (bucket_size * this.overviewCanvas.width) / overviewRange;
	    var gap = bucket_width / 5;
	    var bin, x, y, h;
	 		for ( var i = 0; i < bins.length; i++ )
	 		{
	 			bin = bins[i];
	 			
	 			if ( !bin ) continue;
	 		
	 			x = ( bin.timestamp.getTime() - this.overviewTimespan.min ) / overviewRange * this.overviewCanvas.width;
	 			h = ( this.overviewCanvas.height - 5 ) * bin.count / maxCount;
        if(jq.browser.msie && (jq.browser.version == 7 || jq.browser.version == 8)){
          y = 30 - (30*(bin.count / maxCount));
        } else {
          y = this.overviewCanvas.height - h;
        }
	 			var bar = this.overviewCanvas.rect( x, y, bucket_width - gap, h ); // .attr({fill: "#ddd", 'stroke': 'none'});
	 			this.overviewBars.push( bar );
	 			bar.mouseover( function( event )
	 			{
	 				this.attr({fill : "#fefe00"});
	 			});
	 			bar.mouseout( function( event )
	 			{
	 				this.attr({fill : "#DDD"});
	 			});
	 			
	 			bar = this.overviewCanvas.rect( x, y, bucket_width - gap, h ); // .attr({fill: "#ddd", 'stroke': 'none'});
	 			this.highlightBars.push( bar );
	 			
	 			bar.mouseover( function( event )
	 			{
	 				this.attr({fill : "#fefe00"});
	 			});
	 			bar.mouseout( function( event )
	 			{
	 				this.attr({fill : "#084594"});
	 			});
	 			
	 		}
	 		this.overviewBars.attr({fill: "#ddd", 'stroke': 'none'});
	 		this.highlightBars.attr({fill: "#084594", 'stroke': 'none' });
	 		this.highlightBars.attr( { 'clip-rect' : '600,0,100,100' } );
		},
		
		/**
		 * updates the slider's values array to the current focusTimespan min and max
		 */
		_updateSlider : function()
		{
		  
		  jq( "div#overviewSlider" ).slider( "option", {
    			values : [this.focusTimespan.min,this.focusTimespan.max]
    	});
		},
		
		/**
		 * called as the user drags a caret or the range
		 */
		_updateFocusIndicators : function()
		{
			this._updateFocusHighlight();
			this._updateFocusDateRangeText();
		},
		
		/**
		 * called when the user releases a caret or the range
		 */
		_updateFocusRepresentations : function( rangeSizeChanged )
		{
			this._updateMap();
			if ( rangeSizeChanged )
			{
				this._checkCurrentFocusResolution();
				this._updateFocusResolutions();
			}
			
			this._updateFocusChart();
			this._updateChartAnnotation( this.focusAnnotationCanvas, this.focusTimespan, 10 );
		},
		
		/**
		 * ensure that the current focus resolution is allowed (not showing too few or too many focus bars)
		 */
		_checkCurrentFocusResolution : function()
		{
			var binsInFocus = ( this.focusTimespan.max - this.focusTimespan.min ) / this._resolutions[ this.focusResolution ];
			
			if ( binsInFocus < 1 )
			{
				if ( this.focusBarSets[ this.focusResolution ] ) { this.focusBarSets[ this.focusResolution ].hide(); }
				while ( binsInFocus < 1 )
				{
				  this.focusResolution = this._prev_resolution( this.focusResolution );
					binsInFocus = ( this.focusTimespan.max - this.focusTimespan.min ) / this._resolutions[ this.focusResolution ];
				}
				this._resolutionDirty = true;
			}
			else if ( binsInFocus > this.options.maxFocusBins )
			{
				if ( this.focusBarSets[ this.focusResolution ] )
				{
					this.focusBarSets[ this.focusResolution ].hide();
				}
				
				while ( binsInFocus > this.options.maxFocusBins )
				{
					this.focusResolution = this._next_resolution( this.focusResolution );
					binsInFocus = ( this.focusTimespan.max - this.focusTimespan.min ) / this._resolutions[ this.focusResolution ];
				}
				this._resolutionDirty = true;
			}
			else
			{
				return;
			}
			jq( "div#resolutionChooser button.ui-state-active" ).removeClass( "ui-state-active" );
			jq( "div#resolutionChooser button#"+ this.focusResolution).addClass( "ui-state-active" );
		},
		
		/**
		 * update the map with the current focus date range
		 */
		_updateMap : function()
		{
			this.map.setTimeSpan( new Date( this.focusTimespan.min ), new Date( this.focusTimespan.max ) );
		},
		
		/**
		 * enable/disable resolutions in the resolution chooser based on teh date range
		 */
		_updateFocusResolutions : function()
		{
			var self = this;
			
			jq.each( this._resolutions, function( res, ms )
			{
				var binsInFocus = ( self.focusTimespan.max - self.focusTimespan.min ) / ms;
				
				var $button = jq( "div#resolutionChooser button#"+res); // [value='" + res + "']" )
			  	
				// get the button
				if ( binsInFocus < 1 || binsInFocus > self.options.maxFocusBins )
				{
					$button.addClass( "ui-state-disabled" );
				}
				else if ( $button.hasClass( "ui-state-disabled" ) )
				{
					$button.removeClass( "ui-state-disabled" );
				}
			});
		},
		
		/**
		 * update the background chart ticks and labels for the focus histogram
		 */
		_updateChartAnnotation : function( canvas, timespan, maxTicks, color )
		{
			if ( !maxTicks ) maxTicks = 10;
			if ( !color ) color = "#ddd";
			
			canvas.clear();
			
			var res = 'year';
			var range = timespan.max - timespan.min;			
			
			while ( ( range / 2 ) < this._resolutions[ res ] )
			{
				res = this._prev_resolution( res );
				if ( !res ) break;
			}
			
			// now, how many of these are in our focus
			var num = range / this._resolutions[ res ];
			
			var incs, increment;
			var beginDate = new Date( timespan.min );
			var firstStamp;
			
			// we need to figure out the first actual time-point in this range at the specified resolution
      if (!res) res = 'second';
			switch ( res )
			{
				case "second":
					if ( num < maxTicks )
					{
						firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate(), beginDate.getHours(), beginDate.getMinutes(), beginDate.getSeconds() );
					}
					else
					{
						incs = [2,5,10,15,30];
					}
					break;
				case "minute":
					if ( num < maxTicks )
					{
						firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate(), beginDate.getHours(), beginDate.getMinutes() );
					}
					else
					{
						incs = [2,5,10,15,30];
					}
					break;
				case "hour":
					if ( num < maxTicks )
					{
						firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate(), beginDate.getHours() );
					}
					else
					{
						incs = [2,6,12];
					}
					break;
				case "day":
					if ( num < maxTicks )
					{
						firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate() );
					}
					else 
					{
						incs = [2,7];
					}
					break;
				case "month":
					if ( num < maxTicks )
					{
						firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth() );
					}
					else
					{
						incs = [2,6];
					}
					break;
				case "year":
					firstStamp = new Date();
					if ( num < maxTicks )
					{
						firstStamp.setYear( beginDate.getFullYear() );
					}
					else
					{
						incs = [2,5,10,20,25,50,100];
					}
					break;
			}
			
			if ( num < maxTicks )
			{
				increment = this._resolutions[ res ];
			}
			else
			{
				for ( var i = 0; i < incs.length; i++ )
				{
					if ( ( range / ( this._resolutions[ res ] * incs[i] ) ) < maxTicks )
					{
						break;
					}
				}
				
				switch ( res )
				{
					case "second":
						firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate(), beginDate.getHours(), beginDate.getMinutes(), Math.floor( beginDate.getSeconds() / incs[i] ) * incs[i] );
						break;
					case "minute":
						firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate(), beginDate.getHours(), Math.floor( beginDate.getMinutes() / incs[i] ) * incs[i] );
						break;
					case "hour":
						firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate(), Math.floor( beginDate.getHours() / incs[i] ) * incs[i] );
						break;
					case "day":
						firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), Math.floor( beginDate.getDate() / incs[i] ) * incs[i] );
						break;
					case "month":
						firstStamp = new Date( beginDate.getFullYear(), Math.floor( beginDate.getMonth() / incs[i] ) * incs[i] );
						break;
					case "year":
						firstStamp.setYear( Math.floor( beginDate.getFullYear() / incs[i] ) * incs[i] );
						break;
				}
				
				increment = this._resolutions[ res ] * incs[i];
			}
			
			var tickTime = firstStamp.getTime();
			var x, tickLabel, date;
			while ( tickTime < timespan.max )
			{
				// draw this tick
				x = ( tickTime - timespan.min ) / range * canvas.width;
				canvas.path("M" + x + " 5L" + x + " " + canvas.height ).attr({"stroke" : color});
					
				date = new Date( tickTime );
					
				// label
				tickLabel = (( res == 'month' || res == 'day' ) ? ( date.getMonth() + 1 + '/' + date.getDate() + '/' ) : '') + 
							(( res == 'month' || res == 'day' || res == 'year' ) ? date.getFullYear() : '') + 
							(( res == 'hour' || res == 'minute' || res == 'second' ) ? (' ' + date.toTimeString().substr(0,5)) : '') +
							(( res == 'second' ) ? (':' + date.getSeconds()) : '');
					
				// add the label
				canvas.text( x+5, 15, tickLabel ).attr( { "font-size" : "12px",'text-anchor':'start', 'fill' : color } );
					
				// and add a unit of time
				tickTime += increment;
			}
		},
		
		/**
		 * updates the focus histogram based on the current focus date range
		 */
		_updateFocusChart : function()
		{
			var self = this;
			
			if ( this._resolutionDirty )
			{
				// create or show this set
				if ( !this.focusBarSets[ this.focusResolution ] )
				{
					this.focusBarSets[ this.focusResolution ] = this.focusCanvas.set();
				} 
				else
				{
					this.focusBarSets[ this.focusResolution ].hide();
				}
				
				// hack so that we always draw/show the bars for the current timespan
				this._timespanDirty = true;
				this._resolutionDirty = false;
			}
			
			if ( this._timespanDirty ){
				this.focusBarSets[ this.focusResolution ].hide();
				var bins = this._bins[this.focusResolution];
				var overviewRange = this.overviewTimespan.max - this.overviewTimespan.min;
				var focusRange = this.focusTimespan.max - this.focusTimespan.min;
				var res = this._resolutions[this.focusResolution];
				var maxCount = this._maxCounts[this.focusResolution];
				var bucket_width = Math.max( 1, this.focusCanvas.width / ( focusRange / res ));
				var gap = Math.min( 5, Math.floor( bucket_width / 5 ) );
				var mindex = Math.floor( ( this.focusTimespan.min - this.overviewTimespan.min ) / res );
				var maxdex = Math.ceil( ( this.focusTimespan.max - this.overviewTimespan.min ) / res );
				var bin, x, y, h;
        if (bins){
				  for ( var i = mindex; i < maxdex; i++ ){
				  	bin = bins[i];
				  	if ( !bin ) continue;
				   	x = ( bin.utc - this.focusTimespan.min ) / focusRange * this.focusCanvas.width;
            if ( bin.bar && !this._attributeDirty ) {
              bin.bar.show();
              bin.bar.attr( { x : x, width : bucket_width - gap } );
            } else {
				      h = this.focusCanvas.height * bin.count / maxCount;
              if (jq.browser.msie && (jq.browser.version == 7 || jq.browser.version == 8)){
                y = 100 - (100*(bin.count / maxCount));
              } else {
                y = this.focusCanvas.height - h;
              }
				      bin.bar = this.focusCanvas.rect( x, y, bucket_width - gap, h ).attr({
  	        	  fill: "#084594", 'stroke': 'none'
				      });
				      	
				      bin.bar.bin = bin;
				      bin.bar.mouseover( function( event ){
			 	  		  this.attr({fill : "#fefe00", 'stroke' : '#666' });
			 	  		  self.showTipForFocusBin( this.bin );
			 	  	  });
			 	  	
			 	  	  bin.bar.mouseout( function( event ){
			 	  		  self.hideTipForFocusBin();
			 	  		  if ( !this.bin.selected ){
			 	  			  this.attr({fill : "#084594", 'stroke' : 'none' });
			 	  		  }
			 	  	  });
			 	  	
			 	  	  bin.bar.click( function( event ){
			 	  		  self.highlightBinFeatures( this.bin );
			 	  	  });
				   	  this.focusBarSets[ this.focusResolution ].push( bin.bar );
            }
				  }
				  this._timespanDirty = false;
				  this._attributeDirty = false;
        }
			}
			
		},
		
		highlightBinFeatures : function( bin )
		{
			var layerInd = 2;
			
			var date = this.formatDate( bin.utc );
			var date2 = this.formatDate( bin.utc + this._resolutions[this.focusResolution] );
			
			var exp = "$[opendate] >= '" + date + "' AND $[opendate] < '" + date2 + "'";
			
			bin.selected = true;
			
			this.map.addHighlight( layerInd, { expression: exp } );
			
			// listen for mousedown
			self.map_el.one( 'mousedown', { 'self' : this, 'bins' : [bin] }, this.onMouseDownWhileHighlighted );
		},
		
		onMouseDownWhileHighlighted : function( event )
		{
			var self = event.data.self;
			
			for ( var i = 0; i < event.data.bins.length; i++ )
			{
				event.data.bins[i].selected = false;
				event.data.bins[i].bar.attr({fill : "#084594", 'stroke' : 'none' });
			}
			
			self.map.clearHighlights(2);
		},
		
		formatDate : function( ms )
		{
			var date = new Date(ms);
			
			// year
			var dString = date.getFullYear() + '-';
			
			// month
			var month = date.getMonth() + 1;
			
			if ( month < 10 )
			{
				dString += '0';
			}
			
			dString += month + '-';
			
			// day
			var day = date.getDate();
			
			if ( day < 10 )
			{
				dString += '0';
			}
			
			dString += day + ' ';
			
			// time
			dString += date.toTimeString().substr(0, 8);
			
			return dString;
		},
		
		unhighlightFeatures : function()
		{
			var layerInd = 2;
			
		},
		
		/**
		 * display a tool tip for a particular focus bin
		 */
		showTipForFocusBin : function( bin )
		{
			jq( "div#focusTip" ).html( this._getSingleDateText( bin.timestamp, this.focusResolution ) + ': ' + bin.count + ' features' );
			jq( "div#focusTip" ).show();
			
			var x = ( bin.utc - this.focusTimespan.min ) / (this.focusTimespan.max - this.focusTimespan.min) * this.focusCanvas.width;
			x += .5 * ( this._resolutions[ this.focusResolution ] / ( this.focusTimespan.max - this.focusTimespan.min ) * this.focusCanvas.width );
			
			x = Math.min( this.focusCanvas.width - jq("div#focusTip").width(), x );
			x = Math.max( 1, x );
						
			var maxCount = this._maxCounts[this.focusResolution];
			var h = this.focusCanvas.height * bin.count / maxCount;
			var y = this.focusCanvas.height - h - jq( 'div#focusTip' ).height() - 15;
			
			y = Math.max( 1, y );
				    	
			jq( "div#focusTip" ).css( 'left', x + 'px' );
			jq( "div#focusTip" ).css( 'top', y + 'px' );
		},
		
		/**
		 * hide the focus bin tool tip
		 */
		hideTipForFocusBin : function()
		{
			jq( "div#focusTip" ).hide();
		},
		
		/**
		 * updates the highlight and blockers over the overview histogram
		 */
		_updateFocusHighlight : function()
		{
			var x, width;
			
			x = ( this.focusTimespan.min - this.overviewTimespan.min ) / ( this.overviewTimespan.max - this.overviewTimespan.min ) * this.overviewCanvas.width;
			width = ( this.focusTimespan.max - this.focusTimespan.min ) / ( this.overviewTimespan.max - this.overviewTimespan.min ) * this.overviewCanvas.width;
			
			var clipString = x + ',' + 0 + ',' + width + ',' + 100;
			
			this.highlightBars.attr( { 'clip-rect' : clipString } );
			
			// now update our obscuring bars
			this.obscuringBars[0].attr( { "width" : x } );
			this.obscuringBars[1].attr( { "x" : x + width, "width" : (this.overviewCanvas.width) - (x+width) } );
			this.obscuringBars[2].attr( { "x" : x, "width" : width } );
		},
		
		/**
		 * updates the displayed focus date range text
		 */
		_updateFocusDateRangeText : function()
		{
			jq( 'div#focusRange' ).html( this._getDateRangeText( this.focusTimespan, false ) );
		},
		
		/**
		 * return a date properly formatted for the given resolution
		 */
		_getSingleDateText : function( date, resolution )
		{
			var dateText = '';
			
			if ( resolution == 'day' )
			{
				dateText += date.toDateString().split(' ')[0] + ' ';
			}
			if ( resolution == 'month' || resolution == 'day' )
			{
				dateText += date.getMonth() + 1 + '/';
			}
			if ( resolution == 'day' )
			{
				dateText += date.getDate() + '/';
			}
			if ( resolution == 'day' || resolution == 'month' || resolution == 'year' )
			{
				dateText += date.getFullYear();
			}
			if ( resolution == 'hour' || resolution == 'minute' || resolution == 'second' )
			{
				dateText += date.toTimeString().substr(0,5);
			}
			if ( resolution == 'second' )
			{
				dateText += date.toTimeString().substr(5,3);
			}
			
			return dateText;
		},
		
		_getDateText : function( date, timespan, asLink )
		{
			var beginDate = new Date( timespan.min );
			var endDate = new Date( timespan.max );
			var formattedDate = asLink ? '<a href="">' : '';
			
			formattedDate += '<span class="dateText">';
			
			var isFirst = ( date.getTime() == timespan.min );
			var diff = timespan.max - timespan.min;
			
			// if our range is less than a month, start with the day name
			if ( diff < this._resolutions['month'] && ( isFirst || ( diff > this._resolutions['day'] || ( beginDate.getDate() != endDate.getDate() ) ) ) )
			{
				formattedDate += date.toDateString().split(' ')[0] + ' ';
			}
			
			if ( diff < ( 10 * this._resolutions[ 'year' ] ) && ( isFirst || ( diff > this._resolutions['day'] || ( beginDate.getDate() != endDate.getDate() ) ) ) )
			{
				formattedDate += date.getMonth() + 1 + '/' + date.getDate() + '/';
			}			
			
			if ( isFirst || ( diff > this._resolutions['day'] || ( beginDate.getDate() != endDate.getDate() ) ) )
			{
				formattedDate += date.getFullYear();
			}
			
			var showTime = ( diff < ( .25 * this._resolutions[ 'month' ] ) );
			if ( showTime )
			{				
				if ( isFirst || diff > this._resolutions['day'] || ( beginDate.getDate() != endDate.getDate() ) )
				{
					formattedDate += ' at ';
				}
				
				formattedDate += date.toTimeString().substr(0,5);
				
				if ( diff < ( .25 * this._resolutions['hour'] ) )
				{
					formattedDate += date.toTimeString().substr(5,3);
				}
			}
			
			formattedDate += '</span>';
			if ( asLink )
			{
				formattedDate += '</a>';
			}
			
			return formattedDate;
		},
		
		/**
		 * returns 
		 */
		_getDateRangeText : function( timespan, asLinks )
		{
			var beginDate = new Date( timespan.min );
			var endDate = new Date( timespan.max );
			var diff = timespan.max - timespan.min;
			
			var dateString = this._getDateText( beginDate, timespan, asLinks );
			dateString += ' to ';
			dateString += this._getDateText( endDate, timespan, asLinks );
			
			if ( diff < ( .25 * this._resolutions[ 'month' ] ) )
			{
				dateString += ' GMT';
			}
			return dateString;
		},
		
		/**
		 * gets an initial timespan, prior to any user interaction
		 */
		_getInitialFocusTimespan : function()
		{
			var max = this.overviewTimespan.min + ( .075 * ( this.overviewTimespan.max - this.overviewTimespan.min ) );
			
			return {
				min : this.overviewTimespan.min,
				max : max
			};
		},
		
		/**
		 * step forward in time
		 */
		pageRight : function()
		{
			var range = ( this.focusTimespan.max - this.focusTimespan.min );
			if ( this.focusTimespan.max + range > this.overviewTimespan.max )
			{
				this.focusTimespan.max = this.overviewTimespan.max
				this.focusTimespan.min = this.focusTimespan.max - range
			}
			else
			{
				this.focusTimespan.min = this.focusTimespan.max;
				this.focusTimespan.max = this.focusTimespan.max + range;
			}
			
			this._timespanDirty = true;
			this._updateFocusIndicators();
			this._updateSlider();
			this._updateFocusRepresentations();
			this.map_el.trigger('onTemporalChange');
		},
		
		/**
		 * step backward in time
		 */
		pageLeft : function()
		{
			var range = ( this.focusTimespan.max - this.focusTimespan.min );
			if ( this.focusTimespan.min - range < this.overviewTimespan.min )
			{
				this.focusTimespan.min = this.overviewTimespan.min
				this.focusTimespan.max = this.focusTimespan.min + range
			}
			else
			{
				this.focusTimespan.max = this.focusTimespan.min;
				this.focusTimespan.min = this.focusTimespan.min - range;
			}
			
			this._timespanDirty = true;
			this._updateFocusIndicators();
			this._updateSlider();
			this._updateFocusRepresentations();
			self.map_el.trigger('onTemporalChange');
		},
		
		/** 
		 * start playing from current position
		 */
		play : function()
		{
			var self = this;
			
			jq( "div#playInternal" ).addClass( "pause" );
			this._isPlaying = true;
			
			/*
			this.playInterval = setInterval( function() { self.pageRight(); }, this.options.playInterval );
			*/
			
			// we need to start 2 intervals
			// one to smoothly animate the time slider
			
			
			// the second at a longer interval to update the top graph and the map
			// or perhaps the top graph can update the chart and annotation and this one will only update the map
			
			this.playInterval = setInterval( function()
			{
				self.incrementSlider(.003);
			}, 35 );
			
			this.updateInterval = setInterval( function()
			{
				self._timespanDirty = true;
				self._updateFocusRepresentations();
        //self.trigger('onTemporalChange')
			}, 100 );
		},
		
		incrementSlider : function( perc )
		{
			var range = ( this.focusTimespan.max - this.focusTimespan.min );
			//var adv = Math.round( this.options.stepPercentage * range );
			var adv = Math.round( perc * ( this.overviewTimespan.max - this.overviewTimespan.min ) );
			if ( this.focusTimespan.max >= this.overviewTimespan.max )
			{
				if ( this._playMode == 'range' )
				{
					this.focusTimespan.min = this.overviewTimespan.min;
					this.focusTimespan.max = this.focusTimespan.min + range;
				}
				else
				{
					this.focusTimespan.max = this.focusTimespan.min + adv;
				}
			}
			else
			{
				this.focusTimespan.max = Math.min( this.focusTimespan.max + adv, this.overviewTimespan.max );
				if ( this._playMode == 'range' )
				{
					this.focusTimespan.min = this.focusTimespan.max - range;
				}
			}
			
			this._updateFocusIndicators();
			this._updateSlider();
		},
		
		/**
		 * pause playback at current position
		 */
		pause : function()
		{
			jq( "div#playInternal" ).removeClass( "pause" );
			this._isPlaying = false;
			
			clearInterval( this.playInterval );
			
			this._updateFocusRepresentations();
			clearInterval( this.updateInterval );
		},
		
		/**
		 * minimize this control so that only a bar is shown
		 */
		collapse : function()
		{
			jq( "button#show_hide" ).removeClass( 'hide' );
			jq( "button#show_hide" ).addClass( 'show' );
			
			jq( "div#chartsContainer" ).slideUp(500);
			jq( "div#temporal" ).animate( { 'height' : '31px' }, 500 );
			this.temporal_show_state({expanded:false})
		},
		
		/**
		 * expand
		 */
		expand : function()
		{
			jq( "button#show_hide" ).removeClass( 'show' );
			jq( "button#show_hide" ).addClass( 'hide' );
			
			jq( "div#chartsContainer" ).show();
			jq( "div#temporal" ).animate( { 'height' : (jq( "button#hideOverview" ).hasClass( "show" ) ? '144px' : '189px') }, 500 );
			this.temporal_show_state({expanded:true})
		},

    openOverview: function(){ 
      jq( "div#overviewContainer" ).slideUp(500);
      jq( "div#temporal" ).animate( { 'height' : '144px' }, 500 );
      jq( "button#hideOverview" ).addClass( "show" );
		}

	});
})();

