(function exposeCaseListFilter(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.caseListFilter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function triggerMessages(caseData) {
    const flow = Array.isArray(caseData?.conversation?.flow) ? caseData.conversation.flow : [];
    if (flow.length) return flow.filter(item => item?.type === 'message').map(item => item.content);
    const legacyMessages = Array.isArray(caseData?.conversation?.messages) ? caseData.conversation.messages : [];
    if (legacyMessages.length) return legacyMessages.flatMap(message => message.input || []);
    return caseData?.message?.input || [];
  }

  function matchesCaseFilters(caseData, filters = {}) {
    const query = String(filters.query || '').trim().toLowerCase();
    const scenario = String(filters.scenario || '');
    const tags = Array.isArray(filters.tags) ? filters.tags.filter(Boolean) : [];
    const searchText = [caseData?.meta?.name || '', ...triggerMessages(caseData)].join(' ').toLowerCase();
    const caseTags = Array.isArray(caseData?.message?.tagList) ? caseData.message.tagList : [];
    return (!query || searchText.includes(query))
      && (!scenario || caseData?.meta?.businessScenario === scenario)
      && tags.every(tag => caseTags.includes(tag));
  }

  return { matchesCaseFilters };
});
