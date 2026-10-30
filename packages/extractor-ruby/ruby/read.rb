# The Ruby half of the Ruby extractor. It reads each file with Ripper and reports its class and
# module bodies, its methods and the call sites inside them. Which function a call ties to is a
# question the TypeScript half answers. Ripper ships with every Ruby, so the extractor needs no gem.
#
# Usage: ruby read.rb <repo> < repo-relative paths, one per line
# Writes {"ruby": RUBY_DESCRIPTION, "files": {"<path>": {"parsed": true, "bodies": [...],
# "methods": [...], "calls": [...]}}}, and {"parsed": false} for a file Ripper cannot parse.

require "digest"
require "json"
require "ripper"

class PositionedSexp < Ripper::SexpBuilderPP
  # A def reduces as soon as its last token is read, so the lexer position is its last line.
  def on_def(*args)
    super << lineno
  end

  def on_defs(*args)
    super << lineno
  end
end

class FileReader
  attr_reader :bodies, :methods, :calls

  def initialize(source, tree)
    @lines = source.lines
    @line_starts = @lines.each_with_object([0]) { |line, starts| starts << starts.last + line.bytesize }
    @source = source
    @bodies = []
    @methods = []
    @calls = []
    visit(tree, Context.new([], false, nil))
    @bodies.uniq!
  end

  Context = Struct.new(:nesting, :singleton, :method)

  private

  def visit(node, context)
    return unless node.is_a?(Array)
    return node.each { |child| visit(child, context) } unless node.first.is_a?(Symbol)

    case node.first
    when :module
      visit_body(node[1], node[2], context)
    when :class
      visit(node[2], context)
      visit_body(node[1], node[3], context)
    when :sclass
      visit(node[2], Context.new(context.nesting, true, nil))
    when :def
      visit_def(node[1], node[2], node[3], node.last, context.singleton, context)
    when :defs
      visit_def(node[3], node[4], node[5], node.last, true, context)
    when :fcall, :vcall
      record(context, nil, node[1])
      node.drop(2).each { |child| visit(child, context) }
    when :command
      record(context, nil, node[1])
      visit(node[2], context)
    when :call
      record(context, node[1], node[3])
      visit(node[1], context)
    when :command_call
      record(context, node[1], node[3])
      visit(node[1], context)
      node.drop(4).each { |child| visit(child, context) }
    else
      node.each { |child| visit(child, context) }
    end
  end

  def visit_body(name, body, context)
    nesting = nested(context.nesting, name)
    @bodies << nesting.first.join("::") unless nesting.equal?(context.nesting)
    visit(body, Context.new(nesting, false, nil))
  end

  def visit_def(name, params, body, last_line, singleton, context)
    first_line = name[2][0]
    @methods << {
      "owner" => (context.nesting.first || []).join("::"),
      "singleton" => singleton,
      "name" => name[1],
      "firstLine" => first_line,
      "lastLine" => last_line,
      "sourceHash" => Digest::SHA256.hexdigest(@lines[(first_line - 1)...last_line].join)
    }
    inner = Context.new(context.nesting, singleton, @methods.length - 1)
    visit(params, inner)
    visit(body, inner)
  end

  def record(context, receiver, name)
    return if context.method.nil? || !token?(name)

    @calls << {
      "method" => context.method,
      "line" => name[2][0],
      "name" => name[1],
      "receiver" => receiver_of(receiver, context),
      "expression" => expression_of(receiver, name)
    }
  end

  def token?(node)
    node.is_a?(Array) && node.first.is_a?(Symbol) && node.first.start_with?("@")
  end

  def receiver_of(receiver, context)
    return { "kind" => "self" } if receiver.nil? || self?(receiver)

    path, absolute = constant_path(receiver)
    return { "kind" => "value" } if path.nil?

    { "kind" => "constant", "nesting" => context.nesting, "path" => path, "absolute" => absolute }
  end

  def self?(node)
    node.first == :var_ref && node[1][0] == :@kw && node[1][1] == "self"
  end

  def constant_path(node)
    case node.first
    when :var_ref then node[1][0] == :@const ? [[node[1][1]], false] : nil
    when :top_const_ref then [[node[1][1]], true]
    when :const_path_ref
      path, absolute = constant_path(node[1])
      path && [path + [node[2][1]], absolute]
    end
  end

  # A token of a literal or of `::Foo` starts after the delimiter that opens the receiver.
  OPENING_DELIMITERS = {
    paren: ["("], array: ["["], hash: ["{"], string_literal: ['"', "'"], top_const_ref: ["::"]
  }.freeze

  def expression_of(receiver, name)
    finish = offset_of(name[2]) + name[1].bytesize
    start = receiver.nil? ? offset_of(name[2]) : first_offset_in(receiver) || offset_of(name[2])
    opening = (receiver && OPENING_DELIMITERS[receiver.first] || []).find do |delimiter|
      @source.byteslice(start - delimiter.bytesize, delimiter.bytesize) == delimiter
    end
    start -= opening.bytesize if opening
    @source.byteslice(start...finish).gsub(/\s*\n\s*/, "")
  end

  def first_offset_in(node)
    return unless node.is_a?(Array)
    return offset_of(node[2]) if token?(node)

    node.filter_map { |child| first_offset_in(child) }.min
  end

  def offset_of((line, column))
    @line_starts[line - 1] + column
  end

  def declared_path(name)
    case name.first
    when :const_ref then [[name[1][1]], false]
    when :top_const_ref then [[name[1][1]], true]
    when :const_path_ref then constant_path(name)
    end
  end

  # Ruby searches the name a class or module keyword opened, and not the namespaces its compact
  # name passed through, so `class Admin::RefundsController` adds one entry and not two.
  def nested(nesting, name)
    path, absolute = declared_path(name)
    return nesting if path.nil?

    opened = absolute ? path : (nesting.first || []) + path
    [opened] + nesting
  end
end

repo = ARGV.fetch(0) { abort("usage: ruby read.rb <repo> < paths") }
files = {}
$stdin.each_line(chomp: true) do |path|
  next if path.empty?

  source = File.binread(File.join(repo, path)).force_encoding(Encoding::UTF_8).scrub
  parser = PositionedSexp.new(source, path)
  tree = parser.parse
  if tree.nil? || parser.error?
    files[path] = { "parsed" => false }
    next
  end

  read = FileReader.new(source, tree)
  files[path] = { "parsed" => true, "bodies" => read.bodies, "methods" => read.methods, "calls" => read.calls }
end
$stdout.write(JSON.generate({ "ruby" => RUBY_DESCRIPTION, "files" => files }))
