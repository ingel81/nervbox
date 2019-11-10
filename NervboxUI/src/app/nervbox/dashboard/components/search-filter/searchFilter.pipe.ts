import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'searchfilter',
    pure: false
})
export class SearchFilterPipe implements PipeTransform {
    transform(items: any[], filter: any): any {
        if (!items || !filter) {
            return items;
        }
        // filter items array, items which match and return true will be
        // kept, false will be filtered out
        return items.filter(item => item.fileName.toLowerCase().indexOf(filter.fileName.toLowerCase()) !== -1);
    }
}