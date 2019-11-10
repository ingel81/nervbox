import { Directive, forwardRef, Attribute } from '@angular/core';
import { Validator, AbstractControl, NG_VALIDATORS } from '@angular/forms';

@Directive({
    selector: '[appGreaterThan]',
    providers: [
        { provide: NG_VALIDATORS, useExisting: GreatherThanValidator, multi: true }
    ]
})
export class GreatherThanValidator implements Validator {

    constructor(
        @Attribute('appGreaterThan') public greatherThan: string
    ) { }

    validate(c: AbstractControl): { [key: string]: any } {

        // self value
        let v = c.value;

        // control vlaue
        let e = c.root.get(this.greatherThan);

        // value not greater
        if (e && v <= e.value) {
            return {
                greatherThan: false
            }
        }
        return null;
    }
}