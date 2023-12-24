import { createStore, action } from 'easy-peasy';

const store = createStore({
  projects: [],

  addProject: action((state, payload) => {
    state.todos.push(payload);
  }),
});

export default store;
