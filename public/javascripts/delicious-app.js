import '../sass/style.scss';

import { locales } from 'moment';
import { $, $$ } from './modules/bling';
import autocomplete from './modules/autocomplete';
import typeAhead from './modules/typeAhead';
import makeMap from './modules/map';
import ajaxHeart from './modules/heart';

autocomplete($('#address'), $('#lat'), $('#lng'));

typeAhead($('.search'));

makeMap($('#map'));

const heartForms = $$('form.heart');
heartForms.on('submit', ajaxHeart);

const storeRow = $$('#storeRow');
storeRow.forEach(function(i) {
        i.on('click', function() {
                window.location = i.attributes[1].value;
        });
});
