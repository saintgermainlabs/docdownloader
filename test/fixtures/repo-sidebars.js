// @ts-check
/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      type: 'category',
      label: 'Basics',
      items: ['intro', { type: 'doc', id: 'setup', label: 'Set up' }],
    },
    { type: 'link', label: 'Website', href: 'https://example.com' },
  ],
};

module.exports = sidebars;
