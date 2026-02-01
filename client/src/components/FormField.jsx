
import React from 'react';
import { clsx } from 'clsx';

export const FormField = ({ label, required, children, className }) => {
    return (
        <div className={clsx("mb-4", className)}>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {children}
        </div>
    );
};
