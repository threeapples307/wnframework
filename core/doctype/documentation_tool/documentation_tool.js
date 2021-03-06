wn.require("lib/public/js/lib/beautify-html.js");

cur_frm.cscript.onload = function(doc) {
	wn.docs.build_client_app_toc(wn, "wn");
}

cur_frm.cscript.refresh = function(doc) {
	cur_frm.disable_save();

	cur_frm.add_custom_button("Make Docs", function() {
		wn.model.with_doctype("DocType", function() {
			wn.docs.generate_all($(cur_frm.fields_dict.out.wrapper));
		})
	});
}

wn.provide("docs");
wn.provide("wn.docs");

wn.docs.generate_all = function(logarea) {
	wn.docs.to_write = {};
	var pages = [],
		body = $("<div class='docs'>"),
		original_cur_frm = cur_frm;
		doc = cur_frm.doc;
		make_page = function(name, links) {
			body.empty();
			var page = new wn.docs.DocsPage({
				namespace: name,
				parent: body,
				links: links
			});
			
			var for_namespace = (
				doc.build_pages ? doc.page_name : 
					(doc.build_modules ? null : (
						doc.build_server_api ? doc.python_module_name : null)));
			
			page.write(for_namespace);
			
			// make_page for _toc items
			var pages = (page.obj._toc || []).concat(page.obj._links || []);
			if(pages && pages.length) {
				$.each(pages, function(i, child_name) {
					var parent_name = child_name.split(".").slice(0,-1).join("."),
						child_links = {
							parent: parent_name
						}
						parentobj = wn.provide(parent_name);
						
					if(parentobj._toc) {
						$.each(parentobj._toc, function(j, sibling) {
							if(sibling===child_name && j!==parentobj._toc.length-1)
								child_links.next_sibling = parentobj._toc[i+1];	
						})
					}
					var docs_full_name = wn.docs.get_full_name(child_name);
					if(!wn.docs.to_write[docs_full_name]) {
						make_page(docs_full_name, child_links);
					}
				});
			}
		}
	
		logarea.empty().append("Downloading server docs...<br>");
		
		wn.call({
			"method": "core.doctype.documentation_tool.documentation_tool.get_docs",
			args: {options: cur_frm.doc},
			callback: function(r) {
				
				// append
				wn.provide("docs.dev").modules = r.message.modules;
				wn.provide("docs.dev.framework.server").webnotes = r.message.webnotes;
				wn.provide("docs.dev.framework.client").wn = wn;

				if(!docs._links) docs._links = [];
				
				// append static pages to the "docs" object
				$.each(r.message.pages || [], function(n, obj) {
					$.extend(wn.provide(n), obj);
				});
				
				logarea.append("Preparing html...<br>");
				
				make_page("docs");

				logarea.append("Writing...<br>");
				wn.call({
					method: "core.doctype.documentation_tool.documentation_tool.write_docs",
					args: {
						data: JSON.stringify(wn.docs.to_write),
						build_sitemap: doc.build_sitemap,
						domain: doc.sitemap_domain
					},
					callback: function(r) {
						logarea.append("Wrote " + keys(wn.docs.to_write).length + " pages.");
						cur_frm = original_cur_frm;
					}
				});
			}
		});
}

wn.docs.build_client_app_toc = function(obj, obj_name) {
	var is_module = function(value) {
		return value
			&& $.isPlainObject(value)
			&& value._type !== "instance" 
			&& has_function_or_class(value)
	}
	var has_function_or_class = function(value) {
		var ret = false;
		$.each(value, function(name, prop) {
			if(prop && 
				(typeof prop === "function"
					|| prop._type === "class")
				&& prop._type !== "instance") {
					ret = true;
					return false;
				}
		})
		return ret
	}
	if($.isPlainObject(obj)) {
		var toc = [];
		$.each(obj, function(name, value) {
			if(value) {
				if(is_module(value) || value._type==="class")
					toc.push(obj_name + "." + name);
			}
		});
		if(toc.length) {
			obj._toc = toc;
			$.each(toc, function(i, full_name) {
				var name = full_name.split(".").slice(-1)[0];
				wn.docs.build_client_app_toc(obj[name], full_name);
			})
		}
	}
}

wn.docs.get_full_name = function(name) {
	/* docs:
	Get full name with docs namespace
	*/
	var link_name = name;
	if(name.substr(0,2)==="wn") {
		link_name = "docs.dev.framework.client." + name;
	}
	if(name.substr(0,8)==="webnotes") {
		link_name = "docs.dev.framework.server." + name;
	}
	return link_name;	
}

wn.docs.get_short_name = function(namespace) {
	namespace = namespace.replace("docs.dev.framework.server.", "")
	namespace = namespace.replace("docs.dev.framework.client.", "")
	return namespace;
}

wn.docs.get_title = function(namespace) {
	var obj = wn.provide(namespace);
	return obj._label || wn.docs.get_short_name(namespace)
}

wn.docs.DocsPage = Class.extend({
	init: function(opts) {
		/* docs: create js documentation */
		$.extend(this, opts);
		
		var obj = wn.provide(this.namespace),
			me = this;

		obj = (obj._type == "class" && obj.prototype) ? obj.prototype : obj;
		if(obj._toc && this.links)
			this.links.first_child = obj._toc[0];
		
		this.obj = obj;
		this.make(obj);
	},
	make: function(obj) {
		var has_docs = false;
		this.make_title(obj);
		this.make_breadcrumbs(obj);
		has_docs = this.make_intro(obj);
		has_docs = this.make_toc(obj) || has_docs;
		if(obj._type==="model") {
			this.make_docproperties(obj);
			this.make_docfields(obj);
			has_docs = true;
		}
		if(obj._type=="permissions") {
			this.make_docperms(obj);
			has_docs = true;
		}
		if(obj._type==="controller_client") {
			try {
				this.make_obj_from_cur_frm(obj); 
			} catch(e) {
				console.log("Failed: " + obj._label);
				console.log(e);
			}
		}

		has_docs = this.make_functions(obj) || has_docs;
		
		if(!has_docs) {
			$('<h4 class="text-muted">No docs</h4>').appendTo(this.parent);
		}
		
		this.make_footer();
		if(this.links) {
			this.make_links();
		}
	},
	make_footer: function() {
		$("<br>").appendTo(this.parent);
		$p = $('<p style="font-size: 80%;" class="text-muted pull-right"></p>').appendTo(this.parent);
		$('<div class="clearfix">').appendTo(this.parent);

		if(this.obj._gh_source) {
			$(repl('<a href="%(source)s" target="_blank">\
				<i class="icon-github"></i> Source</i></a>', {
					source: this.obj._gh_source
				})).appendTo($p);
		}
		if(this.obj._modified) {
			$(repl("<span>" + (this.obj._gh_source ? " | " : "") + 'Last Updated: %(modified)s</span>', {
					modified: wn.datetime.global_date_format(this.obj._modified)
				})).appendTo($p);
		}
	},
	make_links: function() {
		if(this.links.parent) {
			var btn_group = $('<div class="btn-group pull-right" \
				style="margin: 15px 0px;">')
				.appendTo(this.parent)
			$("<a class='btn btn-default'>")
				.html('<i class="icon-arrow-up"></i> ' 
					+ wn.docs.get_title(this.links.parent))
				.attr("href", this.links.parent + ".html")
				.appendTo(btn_group);
				
			if(this.links.next_sibling) {
				$("<a class='btn btn-info'>")
					.html('<i class="icon-arrow-right"></i> ' 
						+ wn.docs.get_title(this.links.next_sibling))
					.attr("href", wn.docs.get_full_name(this.links.next_sibling) + ".html")
					.appendTo(btn_group);
			} 
			
			if (this.links.first_child) {
				$("<a class='btn btn-info'>")
					.html('<i class="icon-arrow-down"></i> ' 
						+ wn.docs.get_title(this.links.first_child))
					.attr("href", wn.docs.get_full_name(this.links.first_child) + ".html")
					.appendTo(btn_group);
			}
		}
	},
	make_title: function(obj) {
		if(!obj._no_title) {
			if(obj._title_image && false) {
				var outer = $("<div>")
					.css({
						"background-image": "url(docs/" + obj._title_image + ")",
						"background-size": "100%",
						"background-position": "center-top",
						"margin-bottom": "30px",
						"border-radius": "5px"
					})
					.appendTo(this.parent)
		 			var inner = $("<div>")
						.appendTo(outer)
						.css({
							"text-align": "center",
							"background-color": "rgba(0,0,0,0.4)",
							"color": "white",
							"padding": "240px 20px 220px 20px"
						})
					var head = $("<h1>").appendTo(inner);
			} else {
				var page_icon = obj._icon;
				if(!obj._icon) {
					if(this.namespace.indexOf(".wn.")!==-1)
						page_icon = "code";
					else
						page_icon = "file-text-alt";
				}
				
				if(page_icon.substr(0,5)==="icon-") page_icon = page_icon.substr(5);
				
				var icon = $('<h1 class="pull-right text-muted"><i class="icon-'+
					page_icon +'"></i></h1>')
					.appendTo(this.parent);
				var head = $("<h1>").appendTo(this.parent);
			}
			
			head.html(obj._label || wn.docs.get_short_name(this.namespace))
		}
	},
	make_breadcrumbs: function(obj) {
		var me = this,
			name = this.namespace

		if(name==="docs") return;
			
		var parts = name.split("."),
			ul = $('<ul class="breadcrumb">').appendTo(this.parent),
			fullname = "";
					
		$.each(parts, function(i, p) {
			if(i!=parts.length-1) {
				if(fullname) 
					fullname = fullname + "." + p
				else 
					fullname = p
									
				$(repl('<li><a href="%(name)s.html">%(label)s</a></li>', {
					name: (fullname==="docs" ? "index" : fullname),
					label: wn.provide(fullname)._label || p
				})).appendTo(ul);
			}
		});

		$(repl('<li class="active">%(label)s</li>', {
			label: obj._label || wn.docs.get_short_name(this.namespace)
		})).appendTo(ul)
	},
	make_intro: function(obj) {
		if(obj._intro) {
			$("<p>").html(wn.markdown(obj._intro)).appendTo(this.parent);
			return true;
		}
	},
	make_toc: function(obj) {
		if(obj._toc && !obj._no_toc) {
			var body = $("<div class='well'>")
				.appendTo(this.parent);
			$("<h4>Contents</h4>").appendTo(body);
			var ol = $("<ol>").appendTo(body);
			$.each(obj._toc, function(i, name) {
				var link_name = wn.docs.get_full_name(name);
				$(repl('<li><a href="%(link_name)s.html">%(label)s</a></li>', {
						link_name: link_name,
						label: wn.provide(link_name)._label || name
					}))
					.appendTo(ol)
			});
			return true;
		}
	},
	
	make_docproperties: function(obj) {
		var me = this;

		this.h3("Properties");
		var tbody = this.get_tbody([
				{label:"Property", width: "25%"},
				{label:"Value", width: "25%"},
				{label:"Description", width: "50%"},
			]);
			
		$.each(wn.model.get("DocField", {parent:"DocType"}), function(i, df) {
			if(wn.model.no_value_type.indexOf(df.fieldtype)===-1) {
				if(!df.description) 
					df.description = "";
				df.value = obj._properties[df.fieldname]==null || "";
				if(df.value!=="") {
					$(repl('<tr>\
						<td>%(label)s</td>\
						<td>%(value)s</td>\
						<td>%(description)s</td>\
					</tr>', df)).appendTo(tbody);
				}
			}
		});
	},
	
	make_docfields: function(obj) {
		var me = this,
			docfields = obj._fields;

		if(docfields.length) {
			this.h3("DocFields");
			var tbody = this.get_tbody([
					{label:"Sr", width: "10%"},
					{label:"Fieldname", width: "25%"},
					{label:"Label", width: "20%"},
					{label:"Field Type", width: "25%"},
					{label:"Options", width: "20%"},
				]);
			docfields = docfields.sort(function(a, b) { return a.idx > b.idx ? 1 : -1 })
			$.each(docfields, function(i, df) {
				$(repl('<tr>\
					<td>%(idx)s</td>\
					<td>%(fieldname)s</td>\
					<td>%(label)s</td>\
					<td>%(fieldtype)s</td>\
					<td>%(options)s</td>\
				</tr>', df)).appendTo(tbody);
			});
		};
	},
	make_docperms: function(obj) {
		var me = this;
		if(obj._permissions.length) {
			this.h3("Permissions");
			var tbody = this.get_tbody([
					{label:"Sr", width: "8%"},
					{label:"Role", width: "20%"},
					{label:"Level", width: "7%"},
					{label:"Read", width: "7%"},
					{label:"Write", width: "8%"},
					{label:"Create", width: "8%"},
					{label:"Submit", width: "8%"},
					{label:"Cancel", width: "8%"},
					{label:"Amend", width: "8%"},
					{label:"Report", width: "8%"},
					{label:"Match", width: "10%"},
				]);
			obj._permissions = obj._permissions.sort(function(a, b) { 
				return a.idx > b.idx ? 1 : -1 
			})
			$.each(obj._permissions, function(i, perm) {
				if(!perm.match) perm.match = "";
				$.each(["permlevel", "read", "write", "cancel", "create", "submit", 
					"amend", "report", "match"], function(i, key) {
					if(perm[key]==null) perm[key] = "";
				});
				$(repl('<tr>\
					<td>%(idx)s</td>\
					<td>%(role)s</td>\
					<td>%(permlevel)s</td>\
					<td>%(read)s</td>\
					<td>%(write)s</td>\
					<td>%(create)s</td>\
					<td>%(submit)s</td>\
					<td>%(cancel)s</td>\
					<td>%(amend)s</td>\
					<td>%(report)s</td>\
					<td>%(match)s</td>\
				</tr>', perm)).appendTo(tbody);
			});
		};
	},
	make_obj_from_cur_frm: function(obj) {
		var me = this;
		obj._fetches = [];
		cur_frm = {
			set_query: function() {
				
			},
			cscript: {},
			pformat: {},
			add_fetch: function() {
				obj._fetches.push(arguments)
			},
			fields_dict: {},
			call: function() {
				
			}
		};
		$.each(obj._fields, function(i, f) { 
			cur_frm.fields_dict[f] = {
				grid: {
					get_field: function(fieldname) {
						return {}
					}
				}
			}}
		);
		var tmp = eval(obj._code);
		$.extend(obj, cur_frm.cscript);
	},
	make_functions: function(obj) {
		var functions = this.get_functions(obj);
		if(!$.isEmptyObject(functions)) {
			this.h3(obj._type === "class" ? "Methods" : "Functions");
			this.make_function_table(functions);
			return true;
		}
	},
	get_functions: function(obj) {
		var functions = {};
				
		$.each(obj || {}, function(name, value) {
			if(value && ((typeof value==="function" && typeof value.init !== "function")
				|| value._type === "function")) 
					functions[name] = value;
		});
		return functions;
	},
	make_function_table: function(functions, namespace) {
		var me = this,
			tbody = this.get_tbody();
			
		$.each(functions || {}, function(name, value) {
			me.render_function(name, value, tbody, namespace)
		});
	},
	get_tbody: function(columns) {
		table = $("<table class='table table-bordered' style='table-layout: fixed;'>\
			<thead></thead>\
			<tbody></tbody>\
		</table>").appendTo(this.parent);
		if(columns) {
			$.each(columns || [], function(i, c) {
				$("<th>")
					.css({"width": c.width})
					.html(c.label)
					.appendTo(table.find("thead"))
			});
		}
		return table.find("tbody");
	},
	h3: function(txt) {
		$("<h3>").html(txt).appendTo(this.parent);
	},
	render_function: function(name, value, parent, namespace) {
		var me = this,
			code = value.toString();
		
		namespace = namespace===undefined ? 
			((this.obj._type==="class" || this.obj._type==="controller_client") ? 
				"" : this.namespace) 
			: "";

		if(this.obj._function_namespace)
			namespace = this.obj._function_namespace;

		if(namespace!=="") {
			namespace = wn.docs.get_short_name(namespace);
		}

		if(namespace!=="" && namespace[namespace.length-1]!==".")
			namespace = namespace + ".";

		var args = this.get_args(value);
		
		var help = value._help || code.split("/* docs:")[1];
		if(help && help.indexOf("*/")!==-1) help = help.split("*/")[0];

		var source = "";
		if(code.substr(0, 8)==="function" || value._source) {
			source = repl('<p style="font-size: 90%;">\
				<a href="#" data-toggle="%(name)s">View Source</a></p>\
				<pre data-target="%(name)s" style="display: none; font-size: 12px; \
						background-color: white; border-radius: 0px;\
						overflow-x: auto; word-wrap: normal;"><code class="language-%(lang)s">\
%(code)s</code></pre>', {
				name: name,
				code: value._source || code,
				lang: (value._source ? "python" : "javascript")
			});
		}
		
		try {
			$(repl('<tr>\
				<td style="width: 30%;">%(name)s</td>\
				<td>\
					<h5>Usage:</h5>\
					<pre>%(namespace)s%(name)s(%(args)s)</pre>\
					%(help)s\
					%(source)s\
				</td>\
			</tr>', {
				name: name,
				namespace: namespace,
				args: args,
				help: help ? wn.markdown(help) : "",
				source: source
			})).appendTo(parent)
		} catch(e) {
			console.log("Possible html embedded in: " + name)
			console.log(e);
		}
	},
	get_args: function(obj) {
		if(obj._args) 
			return obj._args.join(", ");
		else
			return obj.toString().split("function")[1].split("(")[1].split(")")[0];
	},
	write: function(callback, for_namespace) {
		if(for_namespace && for_namespace!==this.namespace) {
			callback();
			return;
		}
		
		wn.docs.to_write[this.namespace] = {
			title: wn.app.name + ": " + (this.obj._label || wn.docs.get_short_name(this.namespace)),
			content: html_beautify(this.parent.html())
		}
	}
})