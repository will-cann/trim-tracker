import React, { useState, useRef, useEffect } from 'react';

interface TimePickerProps {
    value: string; // HH:mm format (24-hour)
    onChange: (value: string) => void;
    className?: string;
    readOnly?: boolean;
}

export const TimePicker: React.FC<TimePickerProps> = ({ value, onChange, className = '', readOnly = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Parse the 24-hour time value
    const [hours24, minutes] = value ? value.split(':') : ['00', '00'];
    const hour24 = parseInt(hours24, 10);

    // Convert to 12-hour format
    const isPM = hour24 >= 12;
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;

    // Generate hour options (1-12)
    const hourOptions = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
    const minuteOptions = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

    // Format display value
    const displayValue = value ? `${hour12.toString().padStart(2, '0')}:${minutes} ${isPM ? 'PM' : 'AM'}` : '';

    // Update input value when display value changes
    useEffect(() => {
        if (!isOpen) {
            setInputValue(displayValue);
        }
    }, [displayValue, isOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleTimeChange = (newHour12: string, newMinutes: string, newIsPM: boolean) => {
        if (readOnly) return;
        // Convert 12-hour to 24-hour
        let hour24 = parseInt(newHour12, 10);
        if (hour24 === 12) {
            hour24 = newIsPM ? 12 : 0;
        } else {
            hour24 = newIsPM ? hour24 + 12 : hour24;
        }

        const hour24Str = hour24.toString().padStart(2, '0');
        onChange(`${hour24Str}:${newMinutes}`);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (readOnly) return;
        const newValue = e.target.value;
        setInputValue(newValue);

        // Try to parse the input (formats: "2:30 PM", "14:30", "230p", etc.)
        const timeRegex = /(\d{1,2}):?(\d{2})?\s*(am|pm)?/i;
        const match = newValue.match(timeRegex);

        if (match) {
            let hour = parseInt(match[1], 10);
            const minute = match[2] ? parseInt(match[2], 10) : 0;
            const period = match[3]?.toLowerCase();

            // Validate
            if (hour >= 1 && hour <= 12 && minute >= 0 && minute < 60) {
                const isPM = period === 'pm';
                handleTimeChange(hour.toString().padStart(2, '0'), minute.toString().padStart(2, '0'), isPM);
            } else if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60 && !period) {
                // 24-hour format
                onChange(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
            }
        }
    };

    const handleInputClick = () => {
        if (!readOnly) {
            setIsOpen(!isOpen);
        }
    };

    const handleInputFocus = () => {
        if (!readOnly) {
            inputRef.current?.select();
        }
    };

    return (
        <div className="time-picker" ref={dropdownRef}>
            <input
                ref={inputRef}
                type="text"
                className={`time-picker-input ${className}`}
                value={inputValue}
                onChange={handleInputChange}
                onClick={handleInputClick}
                onFocus={handleInputFocus}
                placeholder="--:-- --"
            />

            {isOpen && (
                <div className="time-picker-dropdown">
                    <div className="time-picker-columns">
                        <div className="time-picker-column">
                            <div className="time-picker-column-header">Hour</div>
                            <div className="time-picker-options">
                                {hourOptions.map((hour) => (
                                    <div
                                        key={hour}
                                        className={`time-picker-option ${parseInt(hour, 10) === hour12 ? 'selected' : ''}`}
                                        onClick={() => handleTimeChange(hour, minutes, isPM)}
                                    >
                                        {hour}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="time-picker-column">
                            <div className="time-picker-column-header">Min</div>
                            <div className="time-picker-options">
                                {minuteOptions.map((minute) => (
                                    <div
                                        key={minute}
                                        className={`time-picker-option ${minute === minutes ? 'selected' : ''}`}
                                        onClick={() => handleTimeChange(hour12.toString().padStart(2, '0'), minute, isPM)}
                                    >
                                        {minute}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="time-picker-column time-picker-ampm">
                            <div className="time-picker-column-header">Period</div>
                            <div className="time-picker-options">
                                <div
                                    className={`time-picker-option ${!isPM ? 'selected' : ''}`}
                                    onClick={() => handleTimeChange(hour12.toString().padStart(2, '0'), minutes, false)}
                                >
                                    AM
                                </div>
                                <div
                                    className={`time-picker-option ${isPM ? 'selected' : ''}`}
                                    onClick={() => handleTimeChange(hour12.toString().padStart(2, '0'), minutes, true)}
                                >
                                    PM
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
