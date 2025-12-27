export const calculateDuration = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 0;

    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);

    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;

    let duration = endTotalMinutes - startTotalMinutes;

    // Handle overnight shifts (e.g. 23:00 to 01:00)
    if (duration < 0) {
        duration += 24 * 60;
    }

    return duration;
};

export const formatDuration = (minutes: number): string => {
    if (minutes <= 0) return '';

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0 && mins > 0) {
        return `${hours}h${mins}m`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else {
        return `${mins}m`;
    }
};
