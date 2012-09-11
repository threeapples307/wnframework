# ERPNext - web based ERP (http://erpnext.com)
# Copyright (C) 2012 Web Notes Technologies Pvt Ltd
# 
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
# 
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# 
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

import webnotes
import webnotes.model

def save_version(session, oldlist, newlist):
	"""save diff of oldlist and newlist as a version
		it is necessary to differentiate between oldlist and newlist
		as the version system is based on reverse chronology"""
	difflist = diff(oldlist, newlist, ["name", "doctype", "idx", "docstatus"])
	
	if difflist:
		# save difflist to tabVersion
		session.insert([{
			"doctype": "Version", 
			"diff": serialize(difflist),
			"modified": newlist[0].modified, 
			"creation": newlist[0].modified,
			"doc_type": newlist[0].doctype, 
			"doc_name": newlist[0].name,
			"doc_modified_by": oldlist[0].modified_by,
			"doc_modified": oldlist[0].modified,
			"version": get_next_version_no(session, newlist[0].doctype, newlist[0].name),
		}])
		
def get_next_version_no(session, doctype, name):
	res = session.db.sql("""select ifnull(max(version), 0) as version from `tabVersion`
		where doc_type=%s and doc_name=%s""", (doctype, name))
	res = res and res[0]["version"] or 0
	return res + 1
	
def get_version(session, doctype, name, version):
	"""returns a specified version (modified) of a doclist"""
	doclist = session.get_doclist(doctype, name)
	
	# get a list of all versions upto given modified datetime
	versions = session.db.sql("""select diff from `tabVersion`
		where doc_type=%s and doc_name=%s and version >= %s
		order by version desc""",
		(doclist[0]["doctype"], doclist[0]["name"], version))

	if not versions:
		# aha! looks like the version does not exist
		session.msgprint("""No version exists for %s: "%s" """ % \
			(doclist[0]["doctype"], doclist[0]["name"]), raise_exception=NameError)
	
	# apply versions in descending chronological order to get the mentioned version
	for diff in versions:
		doclist = merge(doclist, diff["diff"])
	
	return doclist
	
def diff(session, oldlist, newlist, additional_fields=None):
	"""
		returns a diff list between old and new doclists
		diff docs only consist of valid fields and doctype, name, [idx, docstatus]
	"""
	# fieldnames is used as a cache
	fieldnames = {}
	def filter_valid_fields(doc):
		"""filter fields which are valid and ignore the rest"""
		new = {}
		for key in doc:
			if key in fieldnames.setdefault(doc["doctype"],
					session.get_fieldnames(doc["doctype"],
					{"fieldtype": ["not in", webnotes.model.no_value_fields]},
					additional_fields)):
				new[key] = doc[key]
		return new
		
	def get_diff(old, new):
		"""returns diff of two docs"""
		diff = {"doctype": new["doctype"], "name": new["name"]}
		
		# find values different than old ones
		diff.update(dict(([key, old.get(key)] for key in old
			if old.get(key) != new.get(key))))
		
		# find new values and store it as None
		diff.update(dict(([key, None] for key in new if not old.has_key(key))))
		
		# filter only valid fields [we don't want fields like localname]
		return filter_valid_fields(diff)
			
	# get diff of parent
	parent_diff = get_diff(oldlist[0], newlist[0])
	
	# child diff list
	difflist = []
	
	# get values different in existing children or the ones deleted in the new
	for old in oldlist[1:]:
		removed = True
		for new in newlist[1:]:
			if old.doctype == new.doctype and old.name == new.name:
				removed = False
				child_diff = get_diff(old, new)
				# if child contains more than two keys - doctype and name
				if len(child_diff) > 2:
					difflist.append(child_diff)
				break
		if removed:
			# if it is removed, add it in diff, so that when merging, it gets added
			difflist.append(filter_valid_fields(old))
	
	# get new children
	for new in newlist[1:]:
		added = True
		for old in oldlist[1:]:
			if new.doctype == old.doctype and new.name == old.name:
				added = False
				break
		if added:
			# if it is new, mark it for removal, so that when merging, it gets removed
			difflist.append({"doctype": new.doctype, "name": new.name,
				"remove": 1})
	
	# if there is no difference in child and parent, no point in saving the version
	# note: len of parent diff is 2 when there are only two keys - doctype, name
	if not difflist and len(parent_diff) == 2:
		return None
	else:
		return [parent_diff] + difflist
	
def merge(doclist, difflist):
	"""merge diff with doclist"""
	difflist = deserialize(difflist)

	remove_list = []
	for diff in difflist:
		add = True
		for doc in doclist:
			if doc["doctype"] == diff["doctype"] and doc["name"] == diff["name"]:
				# mark for removal!
				if diff.get("remove"):
					remove_list.append([diff["doctype"], diff["name"]])
				else:
					# just merge it with the existing doc
					doc.update(diff)
				add = False
				break
		# looks like the doclist does not contain the diff's doc, so just add it
		if add:
			doclist.append(Document(fielddata = diff, session = doclist[0].session))
	
	# well it has to be a doclist and not just a list
	from webnotes.model.doclist import objectify
	return objectify(doclist[0].session, 
		filter(lambda doc: [doc["doctype"], doc["name"]] not in remove_list, doclist))
	
# why use cPickle?
# getting back/setting objects like datetime is taken care of by cPickle, unlike json
# though, it occupies a bit more space
def deserialize(s):
	if isinstance(s, list):
		return s

	import cPickle
	return cPickle.loads(s.encode("utf-8"))
	
def serialize(obj):
	import cPickle
	return cPickle.dumps(obj)