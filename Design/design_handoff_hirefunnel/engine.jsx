// Flow state machine — shared between all three variants.
// Tracks: screen (start|form|step|end|error), current step id, answers,
// auto-advance toggle, etc. Persists to localStorage so refresh keeps place.

const { useState: _useState, useEffect: _useEffect, useCallback: _useCb } = React;

function useFlowEngine(flow, variant) {
  const LS_KEY = `hirefunnel.session.${variant}`;

  const load = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  };

  const initial = load();
  const [screen, setScreen] = _useState(initial?.screen || "start");
  const [stepId, setStepId] = _useState(initial?.stepId || flow.startStep);
  const [answers, setAnswers] = _useState(initial?.answers || {});
  const [form, setForm] = _useState(initial?.form || { name: "", email: "" });
  const [formErrors, setFormErrors] = _useState({});
  const [textAnswer, setTextAnswer] = _useState("");
  const [videoEnded, setVideoEnded] = _useState(false);
  const [history, setHistory] = _useState(initial?.history || []);

  const step = flow.steps[stepId];

  // Persist
  _useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ screen, stepId, answers, form, history })
      );
    } catch (e) {}
  }, [screen, stepId, answers, form, history, LS_KEY]);

  const submitForm = _useCb(() => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Your name, please";
    if (!form.email.trim()) errs.email = "We need an email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = "That email looks off";
    setFormErrors(errs);
    if (Object.keys(errs).length === 0) {
      setScreen("step");
      setVideoEnded(false);
    }
  }, [form]);

  const choose = _useCb(
    (opt) => {
      setAnswers((a) => ({ ...a, [stepId]: opt.id }));
      setHistory((h) => [...h, stepId]);
      const nextId = opt.next;
      if (!nextId) {
        setScreen("end");
        return;
      }
      const next = flow.steps[nextId];
      setStepId(nextId);
      setVideoEnded(false);
      setTextAnswer("");
      if (next.kind === "end") setScreen("end");
      else setScreen("step");
    },
    [stepId, flow.steps]
  );

  const back = _useCb(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setStepId(prev);
    setVideoEnded(false);
    setTextAnswer("");
    if (flow.steps[prev].kind === "end") setScreen("end");
    else setScreen("step");
  }, [history, flow.steps]);

  const reset = _useCb(() => {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    setScreen("start");
    setStepId(flow.startStep);
    setAnswers({});
    setForm({ name: "", email: "" });
    setHistory([]);
    setFormErrors({});
    setTextAnswer("");
    setVideoEnded(false);
  }, [LS_KEY, flow.startStep]);

  // Progress along the happy path
  const happyIdx = flow.happyPath.indexOf(stepId);
  const progressStep = happyIdx === -1 ? history.length : happyIdx;

  return {
    screen, setScreen,
    stepId, setStepId,
    step,
    answers,
    form, setForm,
    formErrors,
    textAnswer, setTextAnswer,
    videoEnded, setVideoEnded,
    submitForm,
    choose,
    back,
    reset,
    history,
    progressStep,
    progressTotal: flow.happyPath.length,
  };
}

window.useFlowEngine = useFlowEngine;
