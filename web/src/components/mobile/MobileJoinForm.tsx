interface MobileJoinFormProps {
  codeInput: string;
  nameInput: string;
  connected: boolean;
  onCodeInput: (value: string) => void;
  onNameInput: (value: string) => void;
  onSubmit: (e: Event) => void;
}

export function MobileJoinForm(props: MobileJoinFormProps) {
  return (
    <form class="join-form" onSubmit={props.onSubmit}>
      <h1>Join</h1>

      <label class="field">
        <span>Code</span>
        <input
          type="text"
          maxlength={4}
          autocomplete="off"
          autocapitalize="characters"
          placeholder="ABCD"
          value={props.codeInput}
          onInput={(e) => props.onCodeInput(e.currentTarget.value.toUpperCase())}
          required
        />
      </label>

      <label class="field">
        <span>Name</span>
        <input
          type="text"
          maxlength={16}
          placeholder="Olaug"
          value={props.nameInput}
          onInput={(e) => props.onNameInput(e.currentTarget.value)}
          required
        />
      </label>

      <button type="submit" class="btn btn-block" disabled={!props.connected}>
        {props.connected ? 'Join' : 'Connecting'}
      </button>
    </form>
  );
}
