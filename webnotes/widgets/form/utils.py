# Copyright (c) 2012 Web Notes Technologies Pvt Ltd (http://erpnext.com)
# 
# MIT License (MIT)
# 
# Permission is hereby granted, free of charge, to any person obtaining a 
# copy of this software and associated documentation files (the "Software"), 
# to deal in the Software without restriction, including without limitation 
# the rights to use, copy, modify, merge, publish, distribute, sublicense, 
# and/or sell copies of the Software, and to permit persons to whom the 
# Software is furnished to do so, subject to the following conditions:
# 
# The above copyright notice and this permission notice shall be included in 
# all copies or substantial portions of the Software.
# 
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, 
# INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A 
# PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT 
# HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF 
# CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE 
# OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
# 

from __future__ import unicode_literals
import webnotes, json

from webnotes import _

@webnotes.whitelist()
def remove_attach():
	"""remove attachment"""
	import webnotes.utils.file_manager
	fid = webnotes.form_dict.get('fid')
	webnotes.utils.file_manager.remove_file(fid)

@webnotes.whitelist()
def get_fields():
	"""get fields"""
	r = {}
	args = {
		'select':webnotes.form_dict.get('select')
		,'from':webnotes.form_dict.get('from')
		,'where':webnotes.form_dict.get('where')
	}
	ret = webnotes.conn.sql("select %(select)s from `%(from)s` where %(where)s limit 1" % args)
	if ret:
		fl, i = webnotes.form_dict.get('fields').split(','), 0
		for f in fl:
			r[f], i = ret[0][i], i+1
	webnotes.response['message']=r

@webnotes.whitelist()
def validate_link():
	"""validate link when updated by user"""
	import webnotes
	import webnotes.utils
	
	value, options, fetch = webnotes.form_dict.get('value'), webnotes.form_dict.get('options'), webnotes.form_dict.get('fetch')

	# no options, don't validate
	if not options or options=='null' or options=='undefined':
		webnotes.response['message'] = 'Ok'
		return
		
	if webnotes.conn.sql("select name from `tab%s` where name=%s" % (options, '%s'), value):
	
		# get fetch values
		if fetch:
			webnotes.response['fetch_values'] = [webnotes.utils.parse_val(c) \
				for c in webnotes.conn.sql("select %s from `tab%s` where name=%s" \
					% (fetch, options, '%s'), value)[0]]
	
		webnotes.response['message'] = 'Ok'

@webnotes.whitelist()
def add_comment(doclist):
	"""allow any logged user to post a comment"""
	doclist = json.loads(doclist)
	
	doclist[0]["__islocal"] = 1
	doclistobj = webnotes.bean(doclist)
	doclistobj.ignore_permissions = True
	doclistobj.save()
	
	return [d.fields for d in doclist]

	return save(doclist)

@webnotes.whitelist()
def get_next(doctype, name, prev):
	import webnotes.widgets.reportview
	
	prev = int(prev)
	field = "`tab%s`.name" % doctype
	res = webnotes.widgets.reportview.execute(doctype,
		fields = [field], 
		filters = [[doctype, "name", "<" if prev else ">", name]],
		order_by = field + " " + ("desc" if prev else "asc"),
		limit_start=0, limit_page_length=1, as_list=True)

	if not res:
		webnotes.msgprint(_("No further records"))
		return None
	else:
		return res[0][0]
