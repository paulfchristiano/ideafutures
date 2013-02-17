function html_entity_encode(str) {
  return $('<div/>').text(str).html();
}

function html_entity_decode (string, quote_style) {
  // http://kevin.vanzonneveld.net
  // +   original by: john (http://www.jd-tech.net)
  // +      input by: ger
  // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +    revised by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +   bugfixed by: Onno Marsman
  // +   improved by: marc andreu
  // +    revised by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +      input by: Ratheous
  // +   bugfixed by: Brett Zamir (http://brett-zamir.me)
  // +      input by: Nick Kolosov (http://sammy.ru)
  // +   bugfixed by: Fox
  // -    depends on: get_html_translation_table
  // *     example 1: html_entity_decode('Kevin &amp; van Zonneveld');
  // *     returns 1: 'Kevin & van Zonneveld'
  // *     example 2: html_entity_decode('&amp;lt;');
  // *     returns 2: '&lt;'
  var hash_map = {},
    symbol = '',
    tmp_str = '',
    entity = '';
  tmp_str = string.toString();

  if (false === (hash_map = html_translation_table)) {
    return false;
  }

  // fix &amp; problem
  // http://phpjs.org/functions/get_html_translation_table:416#comment_97660
  delete(hash_map['&']);
  hash_map['&'] = '&amp;';

  for (symbol in hash_map) {
    entity = hash_map[symbol];
    tmp_str = tmp_str.split(entity).join(symbol);
  }
  tmp_str = tmp_str.split('&#039;').join("'");

  return tmp_str;
}

var html_translation_table = {
  '38': '&amp;',
  '160': '&nbsp;',
  '161': '&iexcl;',
  '162': '&cent;',
  '163': '&pound;',
  '164': '&curren;',
  '165': '&yen;',
  '166': '&brvbar;',
  '167': '&sect;',
  '168': '&uml;',
  '169': '&copy;',
  '170': '&ordf;',
  '171': '&laquo;',
  '172': '&not;',
  '173': '&shy;',
  '174': '&reg;',
  '175': '&macr;',
  '176': '&deg;',
  '177': '&plusmn;',
  '178': '&sup2;',
  '179': '&sup3;',
  '180': '&acute;',
  '181': '&micro;',
  '182': '&para;',
  '183': '&middot;',
  '184': '&cedil;',
  '185': '&sup1;',
  '186': '&ordm;',
  '187': '&raquo;',
  '188': '&frac14;',
  '189': '&frac12;',
  '190': '&frac34;',
  '191': '&iquest;',
  '192': '&Agrave;',
  '193': '&Aacute;',
  '194': '&Acirc;',
  '195': '&Atilde;',
  '196': '&Auml;',
  '197': '&Aring;',
  '198': '&AElig;',
  '199': '&Ccedil;',
  '200': '&Egrave;',
  '201': '&Eacute;',
  '202': '&Ecirc;',
  '203': '&Euml;',
  '204': '&Igrave;',
  '205': '&Iacute;',
  '206': '&Icirc;',
  '207': '&Iuml;',
  '208': '&ETH;',
  '209': '&Ntilde;',
  '210': '&Ograve;',
  '211': '&Oacute;',
  '212': '&Ocirc;',
  '213': '&Otilde;',
  '214': '&Ouml;',
  '215': '&times;',
  '216': '&Oslash;',
  '217': '&Ugrave;',
  '218': '&Uacute;',
  '219': '&Ucirc;',
  '220': '&Uuml;',
  '221': '&Yacute;',
  '222': '&THORN;',
  '223': '&szlig;',
  '224': '&agrave;',
  '225': '&aacute;',
  '226': '&acirc;',
  '227': '&atilde;',
  '228': '&auml;',
  '229': '&aring;',
  '230': '&aelig;',
  '231': '&ccedil;',
  '232': '&egrave;',
  '233': '&eacute;',
  '234': '&ecirc;',
  '235': '&euml;',
  '236': '&igrave;',
  '237': '&iacute;',
  '238': '&icirc;',
  '239': '&iuml;',
  '240': '&eth;',
  '241': '&ntilde;',
  '242': '&ograve;',
  '243': '&oacute;',
  '244': '&ocirc;',
  '245': '&otilde;',
  '246': '&ouml;',
  '247': '&divide;',
  '248': '&oslash;',
  '249': '&ugrave;',
  '250': '&uacute;',
  '251': '&ucirc;',
  '252': '&uuml;',
  '253': '&yacute;',
  '254': '&thorn;',
  '255': '&yuml;',
  '34': '&quot;',
  '39': '&#39;',
  '60': '&lt;',
  '62': '&gt;',
}

// ascii decimals to real symbols
var temp_table = {}
for (decimal in html_translation_table) {
  if (html_translation_table.hasOwnProperty(decimal)) {
    temp_table[String.fromCharCode(decimal)] = html_translation_table[decimal];
  }
}
html_translation_table = temp_table;
