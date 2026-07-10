# Rules

### E-H page
- All E-H page-specific DOM selectors, original-node class/style handling, and markup assumptions must stay in `src/eh/dom.ts`; components should call runtime helpers as `eh.xxx`, not named imports.

### Components
- Component CSS should live in separate `.css` files and be imported; do not build CSS with inline string templates.
- Component DOM trees should be written in TSX.
- Components should not directly call or construct other components; compose them from an owner/root module instead.
