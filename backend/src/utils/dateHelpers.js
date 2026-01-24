function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU');
  } catch {
    return dateStr;
  }
}

function formatRussianDate(dateStr) {
  if (!dateStr) return '—';

  try {
    const date = new Date(dateStr);

    // Дни недели
    const weekdays = [
      'Воскресенье', 'Понедельник', 'Вторник', 'Среда',
      'Четверг', 'Пятница', 'Суббота'
    ];

    // Месяцы в родительном падеже
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];

    const weekday = weekdays[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return weekday + ', ' + day + ' ' + month + ' ' + year;
  } catch {
    return dateStr;
  }
}

module.exports = {
  formatDate,
  formatRussianDate
};