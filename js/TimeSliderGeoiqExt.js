dojo.provide("myModules.TimeSliderGeoiqExt");
dojo.require("dijit._Widget");
dojo.require("dijit._Templated");
dojo.require("dojox.form.RangeSlider");
dojo.require("dijit.form.HorizontalRuleLabels");
dojo.require("dijit.form.HorizontalRule");
dojo.require("dojox.timing._base");

/***************
 * CSS Includes
 ***************/
//anonymous function to load CSS files required for this module
(function() {
  var css = [dojo.moduleUrl("dojox", "form/resources/RangeSlider.css"), dojo.moduleUrl("esri.dijit", "css/TimeSlider.css")];
  
  var head = document.getElementsByTagName("head").item(0), link;
  for (var i = 0, il = css.length; i < il; i++) {
    link = document.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = css[i];
    head.appendChild(link);
  }
})();

/************************
 * Attachment Editor Dijit
 ************************/
dojo.declare("myModules.TimeSliderGeoiqExt", [dijit._Widget, dijit._Templated], {

  widgetsInTemplate: true,
  templatePath: dojo.moduleUrl(location.pathname.replace(/\/[^/]+$/, "") + "/dijit", "templates/GeoIQTimeSlider.html"),
  basePath: dojo.moduleUrl("dijit"),
  
  _slideDuration: 1000,
  _defaultCount: 10,
  
  /*************
   * Overrides
   *************/
  constructor: function(params, srcNodeRef) {
    // Mixin i18n strings
    dojo.mixin(this, esri.bundle.widgets.timeSlider);
    
    this._iconClass = "tsButton tsPlayButton";
    this.playing = false;
    this.loop = false;
    this.thumbCount = 1;
    this.thumbMovingRate = 1000;
    this._createTimeInstants = false;
    this._options = dojo.mixin({excludeDataAtTrailingThumb: false, excludeDataAtLeadingThumb: false}, params.options || {});
  },
  
  startup: function() {
    this.inherited(arguments);
    
    this._timer = new dojox.timing.Timer();
    this._timer.setInterval(this.thumbMovingRate);
    this._timer.onTick = dojo.hitch(this, "_bumpSlider", 1);
    this._createSlider();  
  },
  
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
    "esriTimeUnitsSeconds"  : 1000,
    "esriTimeUnitsMinutes"  : 1000*60,
    "esriTimeUnitsHours"    : 1000*60*60,
    "esriTimeUnitsDays"     : 1000*60*60*24,
    "esriTimeUnitsMonths"   : 1000*60*60*24*30,
    "esriTimeUnitsYears"    : 1000*60*60*24*365
  },
  
  initSlider: function() {
    this.inherited(arguments);
    this._wire();
    this._isPlaying = false;
    this._isDragging = false;
    //this._playMode = this.options.playMode;
    this._bins = {};
    this._maxCounts = {};
    
    this._resolutionDirty = true;
    this._timespanDirty = true;
    
    // crete the widget content
    //this._finishUI();
    //this._wire();
    this._initCharts();
    this.loaded = false;
    
    //will need to move
    this.overviewTimespan = {};
    this._onTemporalReady();
  },
  
  destroy: function() {
    this._timer.stop();
    this._timer = null;
    this.timeStops = null;
    this._slider.destroy();
    this._slider = null;
    
    if (this._hTicks) {
      this._hTicks.destroyRecursive();
      this._hTicks = null;
    }
    
    if (this._hLabels) {
      this._hLabels.destroyRecursive();
      this._hLabels = null;
    }
    
    this.inherited(arguments);
  },
  
  _wire: function() {
    var self = this;
    
    var play = dojo.byId("play");
    dojo.connect(play, "onclick", function(e) {
      self._onPlay();
    });
    
    var next = dojo.byId("page_right");
    dojo.connect(next, "onclick", function(e) {
      self._onNext();
    });
    
    var prev = dojo.byId("page_left");
    dojo.connect(prev, "onclick", function(e) {
      self._onPrev();
    });
    
    var range = dojo.byId( "rangeMode" )
    dojo.connect(range, "onclick", function( event ) {
      self.setPlayMode( event.target.value );
    });
    
    var cumulative = dojo.byId( "cumulativeMode" )
    dojo.connect(cumulative, "onclick", function( event ) {
      self.setPlayMode( event.target.value );
    });
  },
  
  _onTemporalReady: function( ) {
    var bins = timeSlider.bins;
    var res = timeSlider._timeIntervalUnits;
    this.overviewResolution = res;
    
    this.overviewTimespan.min = bins[0].utc;
    this.overviewTimespan.max = bins[bins.length-1].utc;
    
    this.focusTimespan = this._getInitialFocusTimespan();
    
    dojo.byId('overviewRangeSpan').innerHTML = bins[0].timestamp + ' - ' +  bins[bins.length-1].timestamp
    this._onHorizontalChange();
    this._addBins(bins, res);
    this._drawOverview();
    this._updateChartAnnotation( this.overviewAnnotationCanvas, this.overviewTimespan, 5, "#DDD" );
    this._updateFocusIndicators();
    
    this.focusResolution = res;
    
    this._timespanDirty = true;
    this._updateFocusRepresentations( true );
  },
  
  setPlayMode : function( mode ) {
    var self = this;
    this._playMode = mode;
    if (mode == 'range') {
      dojo.query(".range-mode").addClass("ui-state-active");
      dojo.query(".cumulative-mode").removeClass("ui-state-active");
      this.thumbCount = 2;
      this._createSlider();
    } else {
      dojo.query(".cumulative-mode").addClass("ui-state-active");
      dojo.query(".range-mode").removeClass("ui-state-active");
      this.thumbCount = 1;
      this._createSlider();
    }
  },
  
  /****************
   * init charts
   **************/
  
  _initCharts : function(reload)
    {
      this.overviewAnnotationCanvas = Raphael("overviewAnnotation", dojo.byId( "overviewAnnotation" ).offsetWidth, dojo.byId( "overviewAnnotation" ).offsetHeight );
      this.overviewCanvas = Raphael("overview", dojo.byId("overview").offsetWidth, dojo.byId("overview").offsetHeight);
      
      this.overviewBars = this.overviewCanvas.set();
      this.highlightBars = this.overviewCanvas.set();
      
      this.obscuringCanvas = Raphael("overviewBlockers", dojo.byId("overviewBlockers").offsetWidth, dojo.byId("overviewBlockers").offsetHeight);
      
      this.obscuringBars = this.obscuringCanvas.set();
      
      this.obscuringBars.push( this.obscuringCanvas.rect(-1,0,10,dojo.byId("overview").offsetHeight), this.obscuringCanvas.rect(300,0,10,dojo.byId("overview").offsetHeight) );
      this.obscuringBars.push( this.obscuringCanvas.rect( 0, dojo.byId( "overview" ).offsetHeight - 1, 10, 10 ) );
      
      this.obscuringBars.attr( { fill: "#444", 'fill-opacity' : .1, stroke : "#666" } );
      
      this.focusAnnotationCanvas = Raphael( "focusAnnotation", dojo.byId( "focusAnnotation" ).offsetWidth, dojo.byId( "focusAnnotation" ).offsetHeight );
     
      this.focusCanvas = Raphael("focus", dojo.byId( "focus" ).offsetWidth, dojo.byId( "focus" ).offsetHeight);
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
      //jq.each(this._resolutions, function(name, val) {
      for (i=0;i<this._resolutions;i++) { 
          last_res = this._resolutions[i];
          if (next) {
            return false;            
          } 
          if (resolution == this._resolutions[i]) {
            next = true;
          }
      };
      return last_res;
    },
    
    /**
     * returns the next _finest_ resolution compared to the passed-in resolution
     */
    _prev_resolution : function(resolution)
    {
      var prev_res;
      for (i=0;i<this._resolutions;i++) { 
        if ( resolution == this._resolutions[i] )
        {
          return false;
        }
        prev_res = this._resolutions[i];
      };
      return prev_res;
    },
    
    _addBins : function( bins, resolution )
      {       
        var processedBins = [];
        var ms = this._resolutions[ resolution ];
        var minTime = timeSlider.fullTimeExtent.startTime;
        var max = -999;
        var ind = 0;
        // figure max
        for(var i=0;i<bins.length;i++)
        {
          if ( bins[i].count > max )
          {
            max = bins[i].count;
          }
          bins[i].utc = bins[i].timestamp.getTime();
          
          ind = Math.round( ( bins[i].utc - minTime ) / ms );
          
          processedBins.push(bins[i]);
        };

        this._bins[resolution] = processedBins;
        this._maxCounts[resolution] = max;
      },
      
    /**
     * draws the overview histogram
     */
    _drawOverview : function(fill)
    { 
      //not supporting multiple resolutions right now
      var bins = this._bins[this.overviewResolution];
                              
      var overviewRange = this.overviewTimespan.max - this.overviewTimespan.min;
      // need to know the max count
      var maxCount = this._maxCounts[this.overviewResolution];
      
      // bucket size in ms
      var bucket_size = this._resolutions[ this.overviewResolution ];
      var num_buckets = Math.ceil(overviewRange / bucket_size);
      
      var bucket_width = (bucket_size * this.overviewCanvas.width) / overviewRange + 0.5;
      var gap = bucket_width / 5;
      var bin, x, y, h;
      
      for ( var i = 0; i < bins.length; i++ )
      {
        bin = bins[i];
        if ( !bin ) continue;
      
        x = ( bin.timestamp.getTime() - this.overviewTimespan.min ) / overviewRange * this.overviewCanvas.width;
        //if (i != 0) {x = x - 20.3} //hacky fix for temporary 
        
        h = ( this.overviewCanvas.height - 5 ) * bin.count / maxCount;
        y = this.overviewCanvas.height - h;
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
     * gets an initial timespan, prior to any user interaction
     */
    _getInitialFocusTimespan : function() {
      var max = this.overviewTimespan.min + ( .075 * ( this.overviewTimespan.max - this.overviewTimespan.min ) );
      
      return {
        min : this.overviewTimespan.min,
        max : max
      };
    },
    
     _updateFocusIndicators : function() {
      if (!this.focusTimespan) return;
      var curExtent = this.getCurrentTimeExtent();
      var min = curExtent.startTime.getTime(),
        max = curExtent.endTime.getTime();
      this.focusTimespan.min = min;
      this.focusTimespan.max = max;
      this._updateFocusHighlight();
      this._updateFocusDateRangeText();
    }, 
      
    _updateFocusRepresentations : function( rangeSizeChanged ) {
      if (!this.focusResolution) return;
      if ( rangeSizeChanged )
      {
        this._checkCurrentFocusResolution();
        this._updateFocusResolutions();
      }
      
      this._updateFocusChart();
      this._updateChartAnnotation( this.focusAnnotationCanvas, this.focusTimespan, 10 );
    },  
    
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
    },
    
    _updateFocusDateRangeText : function() {
      if (!this.focusTimespan) return;
      var dateRange = this._getDateRangeText( this.focusTimespan, false );
      dojo.byId( 'focusRange' ).innerHTML = dateRange;
    },  
      
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
    
    _updateFocusHighlight : function() {
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
    
    _getDateText : function( date, timespan, asLink )
    {
      var beginDate = new Date( timespan.min );
      var endDate = new Date( timespan.max );
      var formattedDate = asLink ? '<a href="">' : '';
      
      formattedDate += '<span class="dateText">';
      
      var isFirst = ( date.getTime() == timespan.min );
      var diff = timespan.max - timespan.min;
      
      // if our range is less than a month, start with the day name
      if ( diff < this._resolutions['esriTimeUnitsMonths'] && ( isFirst || ( diff > this._resolutions['esriTimeUnitsDays'] || ( beginDate.getDate() != endDate.getDate() ) ) ) )
      {
        formattedDate += date.toDateString().split(' ')[0] + ' ';
      }
      
      if ( diff < ( 10 * this._resolutions[ 'esriTimeUnitsYears' ] ) && ( isFirst || ( diff > this._resolutions['esriTimeUnitsDays'] || ( beginDate.getDate() != endDate.getDate() ) ) ) )
      {
        formattedDate += date.getMonth() + 1 + '/' + date.getDate() + '/';
      }     
      
      if ( isFirst || ( diff > this._resolutions['esriTimeUnitsDays'] || ( beginDate.getDate() != endDate.getDate() ) ) )
      {
        formattedDate += date.getFullYear();
      }
      
      var showTime = ( diff < ( .25 * this._resolutions[ 'esriTimeUnitsMonths' ] ) );
      if ( showTime )
      {       
        if ( isFirst || diff > this._resolutions['esriTimeUnitsDays'] || ( beginDate.getDate() != endDate.getDate() ) )
        {
          formattedDate += ' at ';
        }
        
        formattedDate += date.toTimeString().substr(0,5);
        
        if ( diff < ( .25 * this._resolutions['esriTimeUnitsHours'] ) )
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
    
    _updateFocusResolutions : function()
    {
      var self = this;
      
      /*jq.each( this._resolutions, function( res, ms )
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
      });*/
    },
    
    /**
     * update the background chart ticks and labels for the focus histogram
     */
    _updateChartAnnotation : function( canvas, timespan, maxTicks, color )
    {
      if ( !maxTicks ) maxTicks = 10;
      if ( !color ) color = "#ddd";
      
      canvas.clear();
      
      var res = timeSlider._timeIntervalUnits;
      
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
      if (!res) res = 'esriTimeUnitsHours';
      switch ( res )
      {
        case "esriTimeUnitsSeconds":
          if ( num < maxTicks )
          {
            firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate(), beginDate.getHours(), beginDate.getMinutes(), beginDate.getSeconds() );
          }
          else
          {
            incs = [2,5,10,15,30];
          }
          break;
        case "esriTimeUnitsMinutes":
          if ( num < maxTicks )
          {
            firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate(), beginDate.getHours(), beginDate.getMinutes() );
          }
          else
          {
            incs = [2,5,10,15,30];
          }
          break;
        case "esriTimeUnitsHours":
          if ( num < maxTicks )
          {
            firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate(), beginDate.getHours() );
          }
          else
          {
            incs = [2,6,12];
          }
          break;
        case "esriTimeUnitsDays":
          if ( num < maxTicks )
          {
            firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate() );
          }
          else 
          {
            incs = [2,7];
          }
          break;
        case "esriTimeUnitsMonths":
          if ( num < maxTicks )
          {
            firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth() );
          }
          else
          {
            incs = [2,6];
          }
          break;
        case "esriTimeUnitsYears":
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
      
      if ( num < maxTicks ) {
        increment = this._resolutions[ res ];
      } else {
        for ( var i = 0; i < incs.length; i++ ) {
          if ( ( range / ( this._resolutions[ res ] * incs[i] ) ) < maxTicks ) {
            break;
          }
        }
        switch ( res )
        {
          case "esriTimeUnitsSeconds":
            firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate(), beginDate.getHours(), beginDate.getMinutes(), Math.floor( beginDate.getSeconds() / incs[i] ) * incs[i] );
            break;
          case "esriTimeUnitsMinutes":
            firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate(), beginDate.getHours(), Math.floor( beginDate.getMinutes() / incs[i] ) * incs[i] );
            break;
          case "esriTimeUnitsHours":
            firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), beginDate.getDate(), Math.floor( beginDate.getHours() / incs[i] ) * incs[i] );
            break;
          case "esriTimeUnitsDays":
            firstStamp = new Date( beginDate.getFullYear(), beginDate.getMonth(), Math.floor( beginDate.getDate() / incs[i] ) * incs[i] );
            break;
          case "esriTimeUnitsMonths":
            firstStamp = new Date( beginDate.getFullYear(), Math.floor( beginDate.getMonth() / incs[i] ) * incs[i] );
            break;
          case "esriTimeUnitsYears":
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
        tickLabel = (( res == 'esriTimeUnitsMonths' || res == 'esriTimeUnitsDays' ) ? ( date.getMonth() + 1 + '/' + date.getDate() + '/' ) : '') + 
              (( res == 'esriTimeUnitsMonths' || res == 'esriTimeUnitsDays' || res == 'esriTimeUnitsYears' ) ? date.getFullYear() : '') + 
              (( res == 'esriTimeUnitsHours' || res == 'esriTimeUnitsMinutes' || res == 'esriTimeUnitsSeconds' ) ? (' ' + date.toTimeString().substr(0,5)) : '') +
              (( res == 'esriTimeUnitsSeconds' ) ? (':' + date.getSeconds()) : '');
          
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
              y = this.focusCanvas.height - h;
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
    
  /*****************
   * Events
   *****************/
  onTimeExtentChange: function() {},
  onPlay: function() {},
  onPause: function() {},
  onNext: function() {},
  onPrevious: function() {},
  
  /*****************
   * Event Listeners
   *****************/
  
  _onHorizontalChange: function() {
    var timeExtent = this._sliderToTimeExtent();
    this.onTimeExtentChange(timeExtent);
    this._updateFocusIndicators();
    this._timespanDirty = true;
    this._updateFocusRepresentations();
    //console.log("StartTime: " + timeExtent.startTime);
    //console.log("EndTime: " + timeExtent.endTime);
  },
  
  _onPlay: function() {
    this.playing = !this.playing;
    this._updateUI();
    if (this.playing) {
      this._timer.start();
      this.onPlay(this._sliderToTimeExtent());
      this._updateFocusIndicators();
      this._timespanDirty = true;
      this._updateFocusRepresentations();
    } else {
      this._timer.stop();
      this.onPause(this._sliderToTimeExtent());
      this._updateFocusIndicators();
      this._timespanDirty = true;
      this._updateFocusRepresentations();
    }
    var val = this._getSliderValue();
    this._offset = dojo.isArray(val) ? (val[1] - val[0]) : 0;
  },
  
  _onNext: function() {
    if (!this.playing) {
      this._bumpSlider(1);
      this.onNext(this._sliderToTimeExtent());
      this._updateFocusIndicators();
      this._timespanDirty = true;
      this._updateFocusRepresentations();
    }
  },
  
  _onPrev: function() {
    if (!this.playing) {
      this._bumpSlider(-1);
      this.onPrevious(this._sliderToTimeExtent());
      this._updateFocusIndicators();
      this._timespanDirty = true;
      this._updateFocusRepresentations();
    }
  },
  
  /*****************
   * Public Methods
   *****************/
  createTimeStopsByCount: function(timeExtent, count) {
    if (!timeExtent || !timeExtent.startTime || !timeExtent.endTime) {
      console.log(this.NLS_invalidTimeExtent);
      return;
    }
    
    count = count || this._defaultCount;
    //Use count-1, disregard start time
    var offset = Math.ceil((timeExtent.endTime - timeExtent.startTime) / (count - 1));
    this.createTimeStopsByTimeInterval(timeExtent, offset, 'esriTimeUnitsMilliseconds');
  },
  
  createTimeStopsByTimeInterval: function(timeExtent, timeInterval, timeIntervalUnits, options) {
    if (!timeExtent || !timeExtent.startTime || !timeExtent.endTime) {
      console.log(this.NLS_invalidTimeExtent);
      return;
    }
    
    this.fullTimeExtent = new esri.TimeExtent(timeExtent.startTime, timeExtent.endTime);
    if (options && options.resetStartTime === true) {
      this._resetStartTime(this.fullTimeExtent, timeIntervalUnits);
    }
    
    this._timeIntervalUnits = timeIntervalUnits;
    var te = this.fullTimeExtent.startTime;
    var timeStops = [];
    while (te <= timeExtent.endTime) {
      timeStops.push(te);
      te = timeExtent._getOffsettedDate(te, timeInterval, timeIntervalUnits);
    }
    
    if (timeStops.length > 0 && timeStops[timeStops.length - 1] < timeExtent.endTime) {
      timeStops.push(te);
    }
    
    this.setTimeStops(timeStops);
  },
  
  getCurrentTimeExtent: function() {
    return this._sliderToTimeExtent();
  },
  
  setTimeStops: function(timeStops) {
    this.timeStops = timeStops || [];
    this._numStops = this.timeStops.length;
    this._numTicks = this._numStops;
    if (esri._isDefined(this.fullTimeExtent) === false){
        this.fullTimeExtent = new esri.TimeExtent(timeStops[0], timeStops[timeStops.length - 1]);
    }
  },
  
  setLoop: function(loop) {
    this.loop = loop;
  },
  
  setThumbCount: function(thumbCount) {
    this.thumbCount = thumbCount;
    this.singleThumbAsTimeInstant(this._createTimeInstants);
    if (this._slider) {
      this._createSlider();
    }
  },
  
  setThumbIndexes: function(indexes) {
    this.thumbIndexes = dojo.clone(indexes) || [0, 1];
    this._initializeThumbs();
  },
  
  setThumbMovingRate: function(thumbMovingRate) {
    this.thumbMovingRate = thumbMovingRate;
    if (this._timer) {
      this._timer.setInterval(this.thumbMovingRate);
    }
  },
  
  setLabels: function(labels) {
    this.labels = labels;
    if (this._slider) {
      this._createSlider();
    }
  },
  
  setTickCount: function(ticks) {
    this._numTicks = ticks;
    if (this._slider) {
      this._createSlider();
    }
  },
  
  singleThumbAsTimeInstant: function(createTimeInstants) {
    this._createTimeInstants = (createTimeInstants && this.thumbCount === 1);
  },
  
  next: function() {
    this._onNext();
  },
  
  pause: function() {
    this.playing = false;
    this._updateUI();
    this._timer.stop();
  },
  
  play: function() {
    if (this.playing === true) {
      return;
    }
    
    this.playing = false;
    this._onPlay();
  },
  
  previous: function() {
    this._onPrev();
  },
  
  /*******************
   * Internal Methods
   *******************/
  _updateUI: function() {
    if (this.playing) {
      dojo.query( ".play-mode" ).addClass( "pause" );
      dojo.byId("temporalTitle").innerHTML = "PAUSE"
    } else {
      dojo.query( ".play-mode" ).removeClass( "pause" );
      dojo.byId("temporalTitle").innerHTML = "PLAY"
    }
    //dojo.removeClass(this.playPauseBtn.iconNode, this._iconClass);
    //this._iconClass = this.playing ? "tsButton tsPauseButton" : "tsButton tsPlayButton";
    //dojo.addClass(this.playPauseBtn.iconNode, this._iconClass);
    //this.previousBtn.set('disabled', this.playing);
    //this.nextBtn.set('disabled', this.playing);
  },
  
  _createSlider: function() {
    if (this._slider) {
      this._slider.destroy();
      this._slider = null;
    }
    
    // To detect the 'rtl' or 'ltr' direction
    // to create the control, seems there are
    // bugs in dojo related to this
    //
    // http://trac.dojotoolkit.org/ticket/9160
    //
    var node = this.domNode;
    while (node.parentNode && !node.dir){
      node = node.parentNode;
    }
    
    var sliderOptions = {
      onChange: dojo.hitch(this, "_onHorizontalChange"),
      showButtons: false,
      discreteValues: this._numStops,
      intermediateChanges:"true",
      slideDuration: this._slideDuration,
      'class': "ts",
      id: "ts",
      dir: node.dir
    };
    
    var ts = dojo.create("div", {
      id: "ts"
    }, dojo.byId("overviewSlider"), "first");
    dojo.create("div", {
      id: "timeSliderTicks"
    }, ts, "first");
    dojo.create("div", {
      id: "timeSliderLabels"
    }, ts);
    
    if (this.thumbCount === 2) {
      this._createRangeSlider(sliderOptions);
    } else {
      this._createSingleSlider(sliderOptions);
    }
    
    this.thumbIndexes = this.thumbIndexes || [0, 1];
    this._createHorizRule();
    this._createLabels();
    
    if (this._createTimeInstants === true) {
      dojo.query(".dijitSliderProgressBarH, .dijitSliderLeftBumper, .dijitSliderRightBumper").forEach("dojo.style(item, { background: 'none' });");
    }
    
    this._initializeThumbs();
    
    dojo.disconnect(this._onChangeConnect);
    this._onChangeConnect = dojo.connect(this._slider, "onChange", dojo.hitch(this, "_updateThumbIndexes"));
  },
  
  _createRangeSlider: function(options) {
    this._isRangeSlider = true;
    this._slider = new dojox.form.HorizontalRangeSlider(options, dojo.byId('ts'));
  },
  
  _createSingleSlider: function(options) {
    this._isRangeSlider = false;
    this._slider = new dijit.form.HorizontalSlider(options, dojo.byId('ts'));
  },
  
  _createHorizRule: function() {
    if (this._hTicks) {
      this._hTicks.destroyRecursive();
      this._hTicks = null;
    }
    
    if (this._numTicks < 2){
      return;
    }
    
    this._hTicks = new dijit.form.HorizontalRule({
      container: "topDecoration",
      ruleStyle: "",
      'class': "tsTicks",
      count: this._numTicks,
      id: "tsTicks"
    }, dojo.byId('timeSliderTicks'));
  },
  
  _createLabels: function() {
    if (this._hLabels) {
      this._hLabels.destroyRecursive();
      this._hLabels = null;
    }
    
    if (this.labels && this.labels.length > 0) {
      this._hLabels = new dijit.form.HorizontalRuleLabels({
        labels: this.labels,
        labelStyle: "",
        'class': "tsLabels",
        id: "tsLabels"
      }, dojo.byId("timeSliderLabels"));
    }
  },
  
  _initializeThumbs: function() {
    if (!this._slider) {
      return;
    }
    
    this._offset = this._toSliderValue(this.thumbIndexes[1]) || 0;
    var t1 = this._toSliderValue(this.thumbIndexes[0]);
    t1 = (t1 > this._slider.maximum || t1 < this._slider.minimum) ? this._slider.minimum : t1;
    if (this._isRangeSlider === true) {
      var t2 = this._toSliderValue(this.thumbIndexes[1]);
      t2 = (t2 > this._slider.maximum || t2 < this._slider.minimum) ? this._slider.maximum : t2;
      t2 = t2 < t1 ? t1 : t2;
      this._setSliderValue([t1, t2]);
    } else {
      this._setSliderValue(t1);
    }
  },
  
  _bumpSlider: function(dir) {
    var val = this._getSliderValue();
    var max = val, min = max;
    var bumpVal = dir;
    if (dojo.isArray(val)) {
      min = val[0];
      max = val[1];
      bumpVal = [{
        'change': dir,
        'useMaxValue': true
      }, {
        'change': dir,
        'useMaxValue': false
      }];
      
    }
    // deal with rounding issues
    if ((Math.abs(min-this._slider.minimum) < 1E-10 && dir < 0) || (Math.abs(max-this._slider.maximum) < 1E-10 && dir > 0)) {
      if (this._timer.isRunning) {
        if (this.loop) {
          this._timer.stop();
          this._setSliderValue(this._getSliderMinValue());
          var timeExtent = this._sliderToTimeExtent();
          this.onTimeExtentChange(timeExtent);
          this._timer.start();
          this.playing = true;
        } else {
          this.pause();
        }
      }
    } else {
      this._slider._bumpValue(bumpVal);
    }            
  },
  
  _updateThumbIndexes: function(){    
    var val = this._getSliderValue();
    if (dojo.isArray(val)) {
      this.thumbIndexes[0] = this._toSliderIndex(val[0]);
      this.thumbIndexes[1] = this._toSliderIndex(val[1]);
    } else {
      this.thumbIndexes[0] = this._toSliderIndex(val);    
    }
  },
  
  _sliderToTimeExtent: function() {
    if (!this.timeStops || this.timeStops.length === 0) {
      return;
    }
    
    var retVal = new esri.TimeExtent();
    var val = this._getSliderValue();
    if (dojo.isArray(val)) {
      retVal.startTime = new Date(this.timeStops[this._toSliderIndex(val[0])]);
      retVal.endTime = new Date(this.timeStops[this._toSliderIndex(val[1])]);
      this._adjustTimeExtent(retVal);
    } else {
      retVal.startTime = (this._createTimeInstants === true) ? new Date(this.timeStops[this._toSliderIndex(val)]) : new Date(this.fullTimeExtent.startTime);
      retVal.endTime = (this._createTimeInstants === true) ? retVal.startTime : new Date(this.timeStops[this._toSliderIndex(val)]);
    }
    
    return retVal;
  },
  
  _adjustTimeExtent: function(timeExtent) {
    if (this._options.excludeDataAtTrailingThumb === false &&
    this._options.excludeDataAtLeadingThumb === false) {
      return;
    }
    
    if (timeExtent.startTime.getTime() === timeExtent.endTime.getTime()) {
      return;
    }
    
    if (this._options.excludeDataAtTrailingThumb) {
      var startTime = timeExtent.startTime;
      startTime.setUTCSeconds(startTime.getUTCSeconds() + 1);
    }
    
    if (this._options.excludeDataAtLeadingThumb) {
      var endTime = timeExtent.endTime;
      endTime.setUTCSeconds(endTime.getUTCSeconds() - 1);
    }
  },
  
  _resetStartTime: function(timeExtent, timeIntervalUnits) {
    switch (timeIntervalUnits) {
      case 'esriTimeUnitsSeconds':
        timeExtent.startTime.setUTCMilliseconds(0);
        break;
      case 'esriTimeUnitsMinutes':
        timeExtent.startTime.setUTCSeconds(0, 0, 0);
        break;
      case 'esriTimeUnitsHours':
        timeExtent.startTime.setUTCMinutes(0, 0, 0);
        break;
      case 'esriTimeUnitsDays':
        timeExtent.startTime.setUTCHours(0, 0, 0, 0);
        break;
      case 'esriTimeUnitsWeeks':
        timeExtent.startTime.setUTCDate(timeExtent.startTime.getUTCDate() - timeExtent.startTime.getUTCDay());
        break;
      case 'esriTimeUnitsMonths':
        timeExtent.startTime.setUTCDate(1);
        timeExtent.startTime.setUTCHours(0, 0, 0, 0);
        break;
      case 'esriTimeUnitsDecades':
        timeExtent.startTime.setUTCFullYear(timeExtent.startTime.getUTCFullYear() - (timeExtent.startTime.getUTCFullYear() % 10));
        break;
      case 'esriTimeUnitsCenturies':
        timeExtent.startTime.setUTCFullYear(timeExtent.startTime.getUTCFullYear() - (timeExtent.startTime.getUTCFullYear() % 100));
        break;
    }
  },
  
  _getSliderMinValue: function() {
    if (this._isRangeSlider) {
      return [this._slider.minimum, this._slider.minimum + this._offset];
    } else {
      return this._slider.minimum;
    }
  },
  
  _toSliderIndex: function(val) {
    var idx = Math.floor((val - this._slider.minimum) * this._numStops / (this._slider.maximum - this._slider.minimum));
    if (idx < 0) {
      idx = 0;
    }
    if (idx >= this._numStops) {
      idx = this._numStops - 1;
    }
    return idx;
  },
  
  _toSliderValue: function(val) {
    return val * (this._slider.maximum - this._slider.minimum) / (this._numStops - 1) + this._slider.minimum;
  },
  
  _getSliderValue: function() {
    return this._slider.get('value');
  },
  
  _setSliderValue: function(val) {
    this._slider._setValueAttr(val, false, false);
  }
});
