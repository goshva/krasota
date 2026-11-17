/* Точка входа: сначала показываем кэш из localStorage (если есть),
   затем — фоновый fetch из Google Sheets с 3 попытками. */
loadState();

(function loadFromCache(){
  const cached = loadItemsCache();
  if (cached && cached.length) {
    items = cached;
    render(true); // без анимации карточек — плавная замена
  }
})();

loadData();  // фоновое обновление
loadThemes();
