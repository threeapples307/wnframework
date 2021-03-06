wn.ui.form.make_control = function(opts) {
	var control_class_name = "Control" + opts.df.fieldtype.replace(/ /g, "");
	if(wn.ui.form[control_class_name]) {
		return new wn.ui.form[control_class_name](opts);
	} else {
		console.log("Invalid Control Name: " + opts.df.fieldtype);
	}
}

// old style
function make_field(docfield, doctype, parent, frm, in_grid, hide_label) { // Factory
	return new wn.ui.form.make_control({
		df: docfield,
		doctype: doctype,
		parent: parent,
		hide_label: hide_label,
		frm: frm
	});
}

wn.ui.form.Control = Class.extend({
	init: function(opts) {
		$.extend(this, opts);
		this.make();

		// if developer_mode=1, show fieldname as tooltip
		if(wn.boot.profile && wn.boot.profile.name==="Administrator" &&
			wn.boot.developer_mode===1 && this.$wrapper) {
				this.$wrapper.tooltip({title: this.df.fieldname});
		}
	},
	make: function() {
		this.$wrapper = $("<div>").appendTo(this.parent);
		this.wrapper = this.$wrapper.get(0);
	},
	
	// returns "Read", "Write" or "None" 
	// as strings based on permissions
	get_status: function(explain) {
		if(!this.doctype) 
			return "Write";
		return wn.perm.get_field_display_status(this.df, 
			locals[this.doctype][this.docname], this.perm, explain);
	},
	refresh: function() {
		this.disp_status = this.get_status();
		this.$wrapper 
			&& this.$wrapper.toggle(this.disp_status!="None")
			&& this.$wrapper.trigger("refresh");
	},
	get_doc: function() {
		return this.doctype && this.docname 
			&& locals[this.doctype] && locals[this.doctype][this.docname] || {};
	},
	parse_validate_and_set_in_model: function(value) {
		var me = this;
		this.inside_change_event = true;
		if(this.parse) value = this.parse(value);

		var set = function(value) {
			me.set_model_value(value); 
			me.inside_change_event = false;
			me.set_mandatory && me.set_mandatory(value);
		}

		this.validate ? this.validate(value, set) : set(value);
	},
	get_parsed_value: function() {
		return this.get_value ? 
			(this.parse ? this.parse(this.get_value()) : this.get_value()) : 
			undefined;
	},
	set_model_value: function(value) {
		if(wn.model.set_value(this.doctype, this.docname, this.df.fieldname, 
			value, this.df.fieldtype)) {
			this.frm && this.frm.dirty();
			this.last_value = value;
		}
	},
});

wn.ui.form.ControlHTML = wn.ui.form.Control.extend({
	make: function() {
		this._super();
		var me = this;
		this.disp_area = this.wrapper;
		this.$wrapper.on("refresh", function() {
			if(me.df.options)
				me.$wrapper.html(me.df.options);
		})
	}
});

wn.ui.form.ControlImage = wn.ui.form.Control.extend({
	make: function() {
		this._super();
		var me = this;
		this.$wrapper.on("refresh", function() {
			me.$wrapper.empty();
			if(me.df.options && me.frm.doc[me.df.options]) {
				$("<img src='"+me.frm.doc[me.df.options]+"' style='max-width: 70%;'>")
					.appendTo(me.$wrapper);
			} else {
				$("<div class='missing-image'><i class='icon-camera'></i></div>")
					.appendTo(me.$wrapper)
			}
			return false;
		})
	}
});

wn.ui.form.ControlReadOnly = wn.ui.form.Control.extend({
	make: function() {
		this._super();
		var me = this;
		this.$wrapper.on("refresh", function() {
			var value = wn.model.get_value(me.doctype, me.docname, me.fieldname);
			me.$wrapper.html(value);
		})
	},
});

wn.ui.form.ControlInput = wn.ui.form.Control.extend({
	make: function() {
		// parent element
		this.make_wrapper();
		this.wrapper = this.$wrapper.get(0);
		this.wrapper.fieldobj = this; // reference for event handlers
		this.set_input_areas();
		
		// set description
		this.set_max_width();
		this.setup_update_on_refresh();
	},
	make_wrapper: function() {
		if(this.only_input) {
			this.$wrapper = $("<span>").appendTo(this.parent);
		} else {
			this.$wrapper = $('<div class="control-group">\
				<label class="control-label"></label>\
				<div class="control-input"></div>\
				<div class="control-value like-disabled-input" style="display: none;"></div>\
				<p class="help-box small text-muted">&nbsp;</p>\
				</div>\
			</div>').appendTo(this.parent);
		}
	},
	set_input_areas: function() {
		if(this.only_input) {
			this.input_area = this.wrapper;
		} else {
			this.label_area = this.label_span = this.$wrapper.find("label").get(0);
			this.input_area = this.$wrapper.find(".control-input").get(0);
			this.disp_area = this.$wrapper.find(".control-value").get(0);	
		}
	},
	set_max_width: function() {
		if(['Code', 'Text Editor', 'Text', 'Small Text', 'Table', 'HTML']
			.indexOf(this.df.fieldtype)==-1) {
			this.$wrapper.css({"max-width": "600px"});
		}
	},
	
	// update input value, label, description
	// display (show/hide/read-only),
	// mandatory style on refresh
	setup_update_on_refresh: function() {
		var me = this;
		this.$wrapper.on("refresh", function() {
			if(me.disp_status != "None") {
				// refresh value
				if(me.doctype && me.docname) {
					me.value = wn.model.get_value(me.doctype, me.docname, me.df.fieldname);
				}

				if(me.disp_status=="Write") {
					me.disp_area && $(me.disp_area).toggle(false);
					$(me.input_area).toggle(true);
					!me.has_input && me.make_input();
					if(me.doctype && me.docname)
						me.set_input(me.value);
				} else {
					$(me.input_area).toggle(false);
					me.disp_area && $(me.disp_area)
						.toggle(true)
						.html(
							wn.format(me.value, me.df, {no_icon:true}, locals[me.doctype][me.name])
						);
				}
				
				me.set_description();
				me.set_label();
				me.set_mandatory(me.value);
				return false;
			}
			
		})
	},
	bind_change_event: function() {
		var me = this;
		this.$input && this.$input.on("change", this.change || function() { 
			me.doctype && me.docname && me.get_value 
				&& me.parse_validate_and_set_in_model(me.get_value()); } );
	},
	bind_save_event: function() {
		if(this.frm && this.$input) {
			var me = this;
			this.$input.keydown("ctrl+s meta+s", function(e) {
				me.frm.save_or_update();
				return false;
			})
		}
	},
	set_label: function(label) {
		if(label) this.df.label = label;
		
		if(this.only_input || this.df.label==this._label) 
			return;
		
		var icon = wn.ui.form.fieldtype_icons[this.df.fieldtype];
		if(this.df.fieldtype==="Link") {
			icon = wn.boot.doctype_icons[this.df.options];
		} else if(this.df.link_doctype) {
			icon = wn.boot.doctype_icons[this.df.link_doctype];
		}
					
		this.label_span.innerHTML = (icon ? '<i class="'+icon+'"></i> ' : "") + 
			wn._(this.df.label);
		this._label = this.df.label;
	},
	set_description: function() {
		if(this.only_input || this.df.description===this._description) 
			return;
		if(this.df.description) {
			this.$wrapper.find(".help-box").html(this.df.description);
		} else {
			this.set_empty_description();
		}
		this._description = this.df.description;
	},
	set_empty_description: function() {
		this.$wrapper.find(".help-box").html("&nbsp;");		
	},
	set_mandatory: function(value) {
		this.$wrapper.toggleClass("has-error", (this.df.reqd 
			&& (value==null || value==="")) ? true : false);
	},
});

wn.ui.form.ControlData = wn.ui.form.ControlInput.extend({
	html_element: "input",
	input_type: "text",
	make_input: function() {
		this.$input = $("<"+ this.html_element +">")
			.attr("type", this.input_type)
			.addClass("col col-lg-12 input-with-feedback")
			.prependTo(this.input_area)
		
		this.set_input_attributes();
		this.input = this.$input.get(0);
		this.has_input = true;
		this.bind_change_event();
		this.bind_save_event();
	},
	set_input_attributes: function() {
		this.$input
			.attr("data-fieldtype", this.df.fieldtype)
			.attr("data-fieldname", this.df.fieldname)
			.attr("placeholder", this.df.placeholder || "")
		if(this.doctype)
			this.$input.attr("data-doctype", this.doctype);
		if(this.df.input_css)
			this.$input.css(this.df.input_css);
	},
	set_input: function(val) {
		this.$input.val(this.format_for_input(val));
		this.last_value = val;
		this.set_mandatory && this.set_mandatory(val);
	},
	get_value: function() {
		return this.$input ? this.$input.val() : undefined;
	},
	format_for_input: function(val) {
		return val==null ? "" : val;
	},
	validate: function(v, callback) {
		if(this.df.options == 'Phone') {
			if(v+''=='')return '';
			v1 = ''
			// phone may start with + and must only have numbers later, '-' and ' ' are stripped
			v = v.replace(/ /g, '').replace(/-/g, '').replace(/\(/g, '').replace(/\)/g, '');

			// allow initial +,0,00
			if(v && v.substr(0,1)=='+') {
				v1 = '+'; v = v.substr(1);
			}
			if(v && v.substr(0,2)=='00') {
				v1 += '00'; v = v.substr(2);
			} 
			if(v && v.substr(0,1)=='0') {
				v1 += '0'; v = v.substr(1);
			}
			v1 += cint(v) + '';
			callback(v1);
		} else if(this.df.options == 'Email') {
			if(v+''=='')return '';
			if(!validate_email(v)) {
				msgprint(wn._("Invalid Email") + ": " +  v);
					callback("");
			} else
				callback(v);
		} else {
			callback(v);
		}
	}
});

wn.ui.form.ControlPassword = wn.ui.form.ControlData.extend({
	input_type: "password"
});

wn.ui.form.ControlInt = wn.ui.form.ControlData.extend({
	make_input: function() {
		var me = this;
		this._super();
		this.$input
			.css({"text-align": "right"})
			.on("focus", function() {
				setTimeout(function() { 
					if(!document.activeElement) return;
					me.validate(document.activeElement.value, function(val) {
						document.activeElement.value = val;
					});
					document.activeElement.select() 
				}, 100);
				return false;
			})
	},
	validate: function(value, callback) {
		return callback(cint(value, null));
	}
});

wn.ui.form.ControlFloat = wn.ui.form.ControlInt.extend({
	validate: function(value, callback) {
		return callback(isNaN(parseFloat(value)) ? null : flt(value));
	},
	format_for_input: function(value) {
		var formatted_value = format_number(parseFloat(value), 
			null, cint(wn.boot.sysdefaults.float_precision, null));
		return isNaN(parseFloat(value)) ? "" : formatted_value;
	}
});

wn.ui.form.ControlCurrency = wn.ui.form.ControlFloat.extend({
	format_for_input: function(value) {
		var formatted_value = format_number(parseFloat(value), 
			get_number_format(this.get_currency()));
		return isNaN(parseFloat(value)) ? "" : formatted_value;
	},
	get_currency: function() {
		return wn.meta.get_field_currency(this.df, this.get_doc());
	}
});

wn.ui.form.ControlPercent = wn.ui.form.ControlFloat;

wn.ui.form.ControlDate = wn.ui.form.ControlData.extend({
	datepicker_options: {
		altFormat:'yy-mm-dd', 
		changeYear: true,
		yearRange: "-70Y:+10Y",
	},
	make_input: function() {
		this._super();
		this.set_datepicker();
	},
	set_datepicker: function() {
		this.datepicker_options.dateFormat = 
			(wn.boot.sysdefaults.date_format || 'yy-mm-dd').replace('yyyy','yy')
		this.$input.datepicker(this.datepicker_options);
	},
	parse: function(value) {
		return value ? dateutil.user_to_str(value) : value;
	},
	format_for_input: function(value) {
		return value ? dateutil.str_to_user(value) : "";
	},
	validate: function(value, callback) {
		var value = wn.datetime.validate(value);
		if(!value) {
			msgprint (wn._("Date must be in format") + ": " + (sys_defaults.date_format || "yyyy-mm-dd"));
			callback("");
		}
		return callback(value);
	}
})

import_timepicker = function() {
	wn.require("lib/js/lib/jquery/jquery.ui.slider.min.js");
	wn.require("lib/js/lib/jquery/jquery.ui.sliderAccess.js");
	wn.require("lib/js/lib/jquery/jquery.ui.timepicker-addon.css");
	wn.require("lib/js/lib/jquery/jquery.ui.timepicker-addon.js");	
}

wn.ui.form.ControlTime = wn.ui.form.ControlData.extend({
	make_input: function() {
		import_timepicker();
		this._super();
		this.$input.timepicker({
			timeFormat: 'hh:mm:ss',
		});
	}
});

wn.ui.form.ControlDatetime = wn.ui.form.ControlDate.extend({
	set_datepicker: function() {
		this.datepicker_options.dateFormat = 
			(wn.boot.sysdefaults.date_format || 'yy-mm-dd').replace('yyyy','yy')
		this.datepicker_options.timeFormat = "hh:mm:ss";

		this.$input.datetimepicker(this.datepicker_options);
	},
	make_input: function() {
		import_timepicker();
		this._super();
	},
	
});

wn.ui.form.ControlText = wn.ui.form.ControlData.extend({
	html_element: "textarea"
});

wn.ui.form.ControlLongText = wn.ui.form.ControlText;
wn.ui.form.ControlSmallText = wn.ui.form.ControlText;

wn.ui.form.ControlCheck = wn.ui.form.ControlData.extend({
	input_type: "checkbox",
	make_wrapper: function() {
		this.$wrapper = $('<div class="checkbox">\
			<label class="input-area">\
				<span class="disp-area" style="display:none;"></span>\
				<span class="label-area"></span>\
			</label>\
			<p class="help-box small text-muted">&nbsp;</p>\
		</div>').appendTo(this.parent)
	},
	set_input_areas: function() {
		this.label_area = this.label_span = this.$wrapper.find(".label-area").get(0);
		this.input_area = this.$wrapper.find(".input-area").get(0);
		this.disp_area = this.$wrapper.find(".disp-area").get(0);	
	},
	make_input: function() {
		this._super();
		this.$input.removeClass("col col-lg-12");
	},
	parse: function(value) {
		return this.input.checked ? 1 : 0;
	},
	validate: function(value, callback) {
		return callback(cint(value));
	},
	set_input: function(value) {
		this.input.checked = value ? 1 : 0;
		this.last_value = value;
	}
});

wn.ui.form.ControlButton = wn.ui.form.ControlData.extend({
	make_input: function() {
		var me = this;
		this.$input = $('<button class="btn btn-default">')
			.prependTo(me.input_area)
			.css({"margin-bottom": "7px"})
			.on("click", function() {
				if(me.frm && me.frm.doc && me.frm.cscript) {
					if(me.frm.cscript[me.df.fieldname]) {
						me.frm.script_manager.trigger(me.df.fieldname, me.doctype, me.docname);
					} else {
						me.frm.runscript(me.df.options, me);
					}
				}
				else if(me.df.click) {
					me.df.click();
				}
			});
		this.input = this.$input.get(0);
		this.has_input = true;
	},
	set_input_areas: function() {
		this._super();
		$(this.disp_area).removeClass();
	},
	set_empty_description: function() {
		this.$wrapper.find(".help-box").empty().toggle(false);
	},
	set_label: function() {
		this.$input && this.$input.html(this.df.label);
	}
});

wn.ui.form.ControlSelect = wn.ui.form.ControlData.extend({
	html_element: "select",
	make_input: function() {
		var me = this;
		this._super();
		if(this.df.options=="attach_files:") {
			this.setup_attachment();
		}
		this.set_options();
	},
	set_input: function(value) {
		// refresh options first - (new ones??)
		this.set_options();
		
		this._super(value);
		
		// not a possible option, repair
		if(this.doctype && this.docname) {
			// model value is not an option,
			// set the default option (displayed)
			var input_value = this.$input.val();
			var model_value = wn.model.get_value(this.doctype, this.docname, this.df.fieldname);
			if(input_value != (model_value || "")) {
				this.set_model_value(input_value);
			} else {
				this.last_value = value;
			}
		}
	},
	setup_attachment: function() {
		var me = this;
		$(this.input).css({"width": "70%"});
		this.$attach = $("<button class='btn btn-default' title='"+ wn._("Add attachment") + "'\
			style='margin-bottom: 9px; \
			padding-left: 6px; padding-right: 6px; margin-left: 6px;'>\
			<i class='icon-plus'></i></button>")
			.click(function() {
				me.frm.attachments.new_attachment(me.df.fieldname);
			})
			.appendTo(this.input_area);
			
		$(document).on("upload_complete", function(event, filename, file_url) {
			if(cur_frm === me.frm) {
				me.set_options();
			}
		})

		this.$wrapper.on("refresh", function() {
			console.log(me.frm.doc.__islocal);
			me.$attach.toggle(!me.frm.doc.__islocal);
		});
	},
	set_options: function() {
		var options = this.df.options || [];
		if(this.df.options=="attach_files:") {
			options = this.get_file_attachment_list();
		} else if(typeof this.df.options==="string") {
			options = this.df.options.split("\n");
		}
	
		if(this.in_filter && options[0] != "") {
			options = add_lists([''], options);
		}
	
		var selected = this.$input.find(":selected").val();

		this.$input.empty().add_options(options || []);

		if(selected) this.$input.val(selected);
	},
	get_file_attachment_list: function() {
		if(!this.frm) return;
		var fl = wn.model.docinfo[this.frm.doctype][this.frm.docname];
		if(fl && fl.attachments) {
			fl = fl.attachments;
			this.set_description("");
			var options = [""];
			for(var fname in fl) {
				if(fname.substr(0,4)!="http")
					fname = "files/" + fname;
				options.push(fname);
			}
			return options;
		} else {
			this.set_description(wn._("Please attach a file first."))
			return [""];
		}
	}
});

// special features for link
// buttons
// autocomplete
// link validation
// custom queries
// add_fetches
wn.ui.form.ControlLink = wn.ui.form.ControlData.extend({
	make_input: function() {
		$('<div class="input-group link-field">\
			<input type="text" class="input-with-feedback">\
			<div class="input-group-btn">\
				<button class="btn btn-default btn-search" title="Search Link">\
					<i class="icon-search"></i>\
				</button>\
				<button class="btn btn-default btn-open" title="Open Link">\
					<i class="icon-play"></i>\
				</button><button class="btn btn-default btn-new" title="Make New">\
					<i class="icon-plus"></i>\
				</button>\
			</div>\
		</div>').appendTo(this.input_area);
		this.$input_area = $(this.input_area);
		this.$input = this.$input_area.find('input');
		this.set_input_attributes();
		this.input = this.$input.get(0);
		this.has_input = true;
		//this.bind_change_event();
		var me = this;
		this.$input.on("blur", function() { 
			if(me.doctype && me.docname && !me.autocomplete_open) {
				var value = me.get_value();
				if(value!==me.last_value) {
					me.parse_validate_and_set_in_model(value);
				}
			}});
		this.bind_save_event();
		this.setup_buttons();
		this.setup_autocomplete();
	},
	setup_buttons: function() {
		var me = this;

		// magnifier - search
		this.$input_area.find(".btn-search").on("click", function() {
			new wn.ui.form.LinkSelector({
				doctype: me.df.options,
				target: me,
				txt: me.$input.val()
			});
		});

		// open
		if(wn.model.can_read(me.df.options)) {
			this.$input_area.find(".btn-open").on("click", function() {
				var value = me.get_value();
				if(value && me.df.options) wn.set_route("Form", me.df.options, value);
			});
		} else {
			this.$input_area.find(".btn-open").remove();
		}
		
		// new
		if(wn.model.can_create(me.df.options)) {
			this.$input_area.find(".btn-new").on("click", function() {
				new_doc(me.df.options)
			});
		} else {
			this.$input_area.find(".btn-new").remove();
		}
	},
	setup_autocomplete: function() {
		var me = this;
		this.$input.autocomplete({
			source: function(request, response) {
				var args = {
					'txt': request.term, 
					'doctype': me.df.options,
				};

				me.set_custom_query(args);

				wn.call({
					type: "GET",
					method:'webnotes.widgets.search.search_link',
					args: args,
					callback: function(r) {
						response(r.results);
					},
				});
			},
			open: function(event, ui) {
				if(cur_dialog) {
					var zindex = cint(cur_dialog.$wrapper.css("z-index")) + 1
					$(this).autocomplete("widget").css("z-index", zindex);
				}
				me.autocomplete_open = true;
			},
			close: function(event, ui) {
				me.autocomplete_open = false;
			},
			select: function(event, ui) {
				if(me.frm && me.frm.doc)
					me.parse_validate_and_set_in_model(ui.item.value);
			}
		}).data('uiAutocomplete')._renderItem = function(ul, item) {
			return $('<li></li>')
				.data('item.autocomplete', item)
				.append(repl('<a><span style="font-weight: bold;">%(label)s</span><br>\
					<span style="font-size:10px;">%(info)s</span></a>',
					item))
				.appendTo(ul);
		};
		// remove accessibility span (for now)
		this.$wrapper.find(".ui-helper-hidden-accessible").remove();
	},
	set_custom_query: function(args) {
		if(this.get_query || this.df.get_query) {
			var q = (this.get_query || this.df.get_query)(this.frm && this.frm.doc, this.doctype, this.docname);

			if (typeof(q)==="string") {
				args.query = q;
			} else if($.isPlainObject(q)) {
				if(q.filters) {
					$.each(q.filters, function(key, value) {
						if(value!==undefined) {
							q.filters[key] = value || null;
						}
					});
				}
				$.extend(args, q);
			}
		}
	},
	validate: function(value, callback) {
		// validate the value just entered
		var me = this;

		if(this.df.options=="[Select]") {
			callback(value);
			return;
		}
		
		this.frm.script_manager.validate_link_and_fetch(this.df, this.docname, value, callback);
	},
});

wn.ui.form.ControlCode = wn.ui.form.ControlInput.extend({
	editor_name: "ACE",
	make_input: function() {
		$(this.input_area).css({"min-height":"360px"});
		var me = this;
		this.editor = new wn.editors[this.editor_name]({
			parent: this.input_area,
			change: function(value) {
				me.parse_validate_and_set_in_model(value);
			},
			field: this
		});
		this.has_input = true;
		
		if(this.editor.$editor) {
			this.editor.$editor.keypress("ctrl+s meta+s", function() {
				me.frm.save_or_update();
			});
		}
	},
	get_value: function() {
		return this.editor.get_value();
	},
	set_input: function(value) {
		this.editor.set_input(value);
		this.last_value = value;
	}
});

wn.ui.form.ControlTextEditor = wn.ui.form.ControlCode.extend({
	editor_name: "BootstrapWYSIWYG"
});

wn.ui.form.ControlTable = wn.ui.form.Control.extend({
	make: function() {
		this._super();
		this.grid = new wn.ui.form.Grid({
			frm: this.frm,
			df: this.df,
			perm: this.perm,
			parent: this.wrapper
		})
		if(this.frm)
			this.frm.grids[this.frm.grids.length] = this;

		// description
		if(this.df.description) {
			$('<p class="text-muted small">' + this.df.description + '</p>')
				.appendTo(this.wrapper);
		}
		
		var me = this;
		this.$wrapper.on("refresh", function() {
			me.grid.refresh();
			return false;
		});
	}
})

wn.ui.form.fieldtype_icons = {
	"Date": "icon-calendar",
	"Time": "icon-time",
	"Datetime": "icon-time",
	"Code": "icon-code",
	"Select": "icon-flag"
};