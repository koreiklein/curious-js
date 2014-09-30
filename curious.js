// Curious client-side JSON parsing
//

var ex = undefined;
if (typeof window !== 'undefined') { ex = window; }
else if (typeof exports !== 'undefined' && exports) {
  ex = exports;
}

ex.CuriousObjects = (function() {
  function CuriousObject(hash_data, url) {
    this.id = hash_data.id;
    for (var k in hash_data) {
      this[k] = hash_data[k];
    }
    this.__url = url;
  }

  function parse_objects(data) {
    if (data.objects === undefined) { return []; }
    var objects = [];
    for (var i=0; i<data.objects.length; i++) {
      var obj = data.objects[i];
      var url = data.urls[i];
      var obj_data = {};
      for (var j=0; j<data.fields.length; j++) {
        obj_data[data.fields[j]] = obj[j];
      }
      objects.push(new CuriousObject(obj_data, url));
    }
    return objects;
  }

  function parse_results(relationships, results, existing_object_dicts) {
    // get objects associated with each subquery. for each subquery, build a
    // hash of ID to object. existing_object_dicts should be an array of dicts,
    // each dict is a mapping of ID to existing objects. if existing objects
    // are specified, will build relationships using existing objects.

    var objects = [];

    for (var i=0; i<results.data.length; i++) {
      var result_objects = parse_objects(results.data[i]);
      var d = {};
      for (var j=0; j<result_objects.length; j++) {
        if (existing_object_dicts !== undefined && existing_object_dicts !== null &&
            existing_object_dicts[i] !== undefined && existing_object_dicts[i] !== null &&
            existing_object_dicts[i][result_objects[j].id] !== undefined) {
          d[result_objects[j].id] = existing_object_dicts[i][result_objects[j].id];
        }
        else {
          d[result_objects[j].id] = result_objects[j];
        }
      }
      objects.push(d);
    }

    // for each subquery, add a relationship to results of next subquery, and
    // then a reverse relationship
    for (var i=1; i<results.results.length; i++) {
      var rel = relationships[i];

      var res_tups = results.results[i].objects;
      var join_idx = results.results[i].join_index;
      var join_src = objects[join_idx];
      var join_obj = objects[i];
      var rev = relationships[join_idx];

      // add empty replationship
      for (var k in join_src) { join_src[k][rel] = []; }
      for (var k in join_obj) { join_obj[k][rev] = []; }

      for (var j=0; j<res_tups.length; j++) {
        var obj_src = res_tups[j];
        var src = join_src[obj_src[1]];
        if (obj_src[0]) {
          var obj = join_obj[obj_src[0]];

          // forward relationship from query to next query
          src[rel].push(obj);
          // reverse relationship
          obj[rev].push(src);
        }
      }
    }

    return objects;
  }

  function dict_to_array(d) {
    var r = [];
    for (var k in d) { r.push(d[k]); }
    return r;
  }

  function array_to_dict(a) {
    var d = {};
    for (var i=0; i<a.length; i++) {
      d[a[i].id] = a[i];
    }
    return d;
  }

  function id_list(objects) {
    var ids = [];
    for (var i=0; i<objects.length; i++) {
      if (ids.indexOf(objects[i].id) < 0) {
        ids.push(objects[i].id);
      }
    }
    return ids;
  }

  function id_str(objects) {
    var ids = id_list(objects);
    if (ids.length === 0) { return null; }
    return ids.join(',');
  }

  return {
    parse: parse_results,
    d2a: dict_to_array,
    a2d: array_to_dict,
    id_list: id_list,
    id_str: id_str
  }

}());


// Helper for making a Curious query and getting back parsed objects. Use with
// angular $http compatible HTTP request facilities (e.g. jQuery?)

ex.CuriousQ = function(curious_url, http, node_requests, ns) {
  if (!ns && typeof window !== 'undefined') { ns = window; }

  function __get(q, params, relationships, existing_object_arrays, cb) {
    console.log(q);

    var existing_object_dicts = undefined;
    if (existing_object_arrays) {
      existing_object_dicts = [];
      for (var i=0; i<existing_object_arrays.length; i++) {
        var data_array = existing_object_arrays[i];
        if (data_array) {
          existing_object_dicts.push(ns.CuriousObjects.a2d(data_array));
        }
        else {
          existing_object_dicts.push(null);
        }
      }
    }

    var args = {d: 1, fk: 0, q: q};
    var overwrite_args = {x: 1};

    if (params) {
      for (var k in params) {
        if (args[k] === undefined) { args[k] = params[k]; }
      }
    }
    for (var k in overwrite_args) {
      if (args[k] === undefined) { args[k] = overwrite_args[k]; }
    }

    var post_cb = function(resp) {
      var objects = ns.CuriousObjects.parse(relationships, resp.result, existing_object_dicts);
      for (var i=0; i<objects.length; i++) { objects[i] = ns.CuriousObjects.d2a(objects[i]); }
      // console.log(objects);
      cb(objects);
    };

    if (node_requests) {
      http.post({url: curious_url, body: JSON.stringify(args)}, function(error, response, body) {
        var resp = JSON.parse(body);
        post_cb(resp);
      });
    }
    else {
      http.post(curious_url, args).success(post_cb);
    }
  }

  function get(q, relationships, cb, params) { __get(q, params, relationships, null, cb); }
  function get_with_objs(q, relationships, existing_object_arrays, cb, params) {
    __get(q, params, relationships, existing_object_arrays, cb);
  }
  function get_with_start(q, relationships, starting_objects, cb, params) {
    var existing_object_arrays = [];
    for (var i=0; i<relationships.length; i++) {
      existing_object_arrays.push(null);
    }
    existing_object_arrays[0] = starting_objects;
    __get(q, params, relationships, existing_object_arrays, cb);
  }

  return {
    get: get,
    get_with_objs: get_with_objs,
    get_with_start: get_with_start
  }
};
